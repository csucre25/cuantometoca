"""Bot de Telegram del site en modo polling (aiogram 3). Uso: python -m pipeline.cli bot --site pe

Solo atiende al chat `admin_chat_id` del site: cualquier otro mensaje o botón se descarta sin
responder (docs/02 §10). La lógica vive en acciones.py; aquí solo se conecta con Telegram.
"""

from __future__ import annotations

import asyncio
import logging
from collections.abc import Awaitable, Callable
from datetime import datetime
from html import escape
from typing import Any
from zoneinfo import ZoneInfo

from aiogram import BaseMiddleware, Bot, Dispatcher, F, Router
from aiogram.client.default import DefaultBotProperties
from aiogram.enums import ParseMode
from aiogram.filters import Command, CommandStart
from aiogram.fsm.context import FSMContext
from aiogram.fsm.state import State, StatesGroup
from aiogram.types import BotCommand, CallbackQuery, InlineKeyboardMarkup, Message, TelegramObject

from pipeline import github, params_pr, publicacion
from pipeline.bot import acciones, tarjetas
from pipeline.config import Site
from pipeline.store import Store

log = logging.getLogger("pipeline.bot")

COMANDOS = [
    BotCommand(command="estado", description="Último deploy, parámetros clave y pendientes"),
    BotCommand(command="pendientes", description="Propuestas y borradores por aprobar"),
    BotCommand(command="parametros", description="Valores vigentes con su fuente"),
    BotCommand(command="temporada", description="Qué preparar ahora y lo próximo"),
    BotCommand(command="deploy", description="Publicar el sitio de nuevo"),
    BotCommand(command="pausa", description="Detener la revisión diaria"),
    BotCommand(command="reanudar", description="Reanudar la revisión diaria"),
]


class SoloAdmin(BaseMiddleware):
    """Descarta todo update cuyo chat no sea el del administrador del site."""

    def __init__(self, admin_chat_id: int):
        self.admin_chat_id = admin_chat_id

    async def __call__(self, handler: Callable[[TelegramObject, dict[str, Any]], Awaitable[Any]], event: TelegramObject, data: dict[str, Any]) -> Any:
        chat = data.get("event_chat")
        if chat is None or chat.id != self.admin_chat_id:
            log.warning("Update ignorado de un chat no autorizado: %s", getattr(chat, "id", None))
            return None
        return await handler(event, data)


class Correccion(StatesGroup):
    esperando = State()


def _teclado(botones: dict[str, Any]) -> InlineKeyboardMarkup:
    return InlineKeyboardMarkup.model_validate(botones)


def crear_router(site: Site, store: Store) -> Router:
    r = Router()

    def hoy():
        return datetime.now(ZoneInfo(site.timezone)).date()

    @r.message(CommandStart())
    @r.message(Command("ayuda", "help"))
    async def ayuda(m: Message) -> None:
        await m.answer(f"Bot de <b>{site.domain}</b>.\n\n{acciones.AYUDA}")

    @r.message(Command("cancelar"))
    async def cancelar(m: Message, state: FSMContext) -> None:
        await state.clear()
        await m.answer("Cancelado.")

    @r.message(Command("estado"))
    async def estado(m: Message) -> None:
        deploy, error = None, None
        try:
            deploy = await asyncio.to_thread(github.ultimo_deploy)
        except Exception as e:  # GitHub caído o sin red: el resto del estado sigue siendo útil
            error = type(e).__name__
        await m.answer(acciones.texto_estado(site, store, deploy, hoy(), error_deploy=error), disable_web_page_preview=True)

    async def abrir_pr(m: Message, pid: int) -> None:
        p = store.propuesta(pid)
        try:
            pr = await asyncio.to_thread(params_pr.abrir_pr, store, p, hoy=hoy())  # type: ignore[arg-type]
        except (params_pr.AplicarError, github.GitHubError) as e:
            boton = {"inline_keyboard": [[{"text": "🔀 Reintentar PR", "callback_data": f"r:{pid}"}]]}
            await m.answer(f"⚠️ No pude abrir el PR: {escape(str(e))}", reply_markup=_teclado(boton))
            return
        await m.answer(
            f'🔀 Abrí el <a href="{escape(pr["url"])}">PR #{pr["numero"]}</a>. Te aviso cuando el CI (casos dorados) termine, unos 5 minutos.',
            disable_web_page_preview=True,
        )

    @r.message(Command("pendientes"))
    async def pendientes(m: Message) -> None:
        propuestas, borradores = store.propuestas("pendiente"), store.borradores("pendiente")
        sin_pr = [p for p in store.propuestas("confirmada") if store.pr(p.id) is None]
        listos, fallidos, en_ci = store.prs("listo"), store.prs("falla"), store.prs("ci")
        if not (propuestas or borradores or sin_pr or listos or fallidos or en_ci):
            await m.answer("Nada pendiente. ✨")
            return
        resumen = [f"📌 {len(propuestas)} propuesta(s)", f"📝 {len(borradores)} borrador(es)"]
        if en_ci:
            resumen.append(f"⏳ {len(en_ci)} PR esperando el CI")
        await m.answer(" · ".join(resumen))
        for p in propuestas:
            await m.answer(tarjetas.texto_propuesta(p), reply_markup=_teclado(tarjetas.botones_propuesta(p)), disable_web_page_preview=True)
        for p in sin_pr:
            boton = {"inline_keyboard": [[{"text": "🔀 Abrir PR", "callback_data": f"r:{p.id}"}]]}
            await m.answer("Confirmada, sin PR:\n" + tarjetas.texto_propuesta(p), reply_markup=_teclado(boton), disable_web_page_preview=True)
        for pr in listos:
            await m.answer(
                f'✅ <a href="{escape(pr.url)}">PR #{pr.numero}</a> con el CI en verde, listo para publicar.',
                reply_markup=_teclado(publicacion.botones_publicar(pr.propuesta_id)),
            )
        for pr in fallidos:
            await m.answer(f'❌ <a href="{escape(pr.url)}">PR #{pr.numero}</a> con el CI en rojo.', reply_markup=_teclado(publicacion.botones_descartar(pr.propuesta_id)))
        for b in borradores:
            await m.answer(tarjetas.texto_borrador(b), reply_markup=_teclado(tarjetas.botones_borrador(b)))

    @r.message(Command("parametros"))
    async def parametros(m: Message) -> None:
        await m.answer(acciones.texto_parametros(site, hoy()), disable_web_page_preview=True)

    @r.message(Command("temporada"))
    async def temporada(m: Message) -> None:
        await m.answer(acciones.texto_temporada(site.country, hoy()))

    @r.message(Command("pausa"))
    async def pausa(m: Message) -> None:
        store.fijar_ajuste("pausa", "1")
        store.registrar("pausa")
        await m.answer("⏸ Revisión diaria en pausa. Usa /reanudar para volver a activarla.")

    @r.message(Command("reanudar"))
    async def reanudar(m: Message) -> None:
        store.fijar_ajuste("pausa", "0")
        store.registrar("reanudar")
        await m.answer("▶️ Revisión diaria reanudada. Si hoy no se hizo, se hará en el próximo minuto.")

    @r.message(Command("borrador"))
    async def borrador(m: Message) -> None:
        await m.answer("La generación de borradores con IA llega con la fase de contenido (docs/04, fase 5).")

    @r.message(Command("deploy"))
    async def deploy(m: Message) -> None:
        botones = {"inline_keyboard": [[{"text": "🚀 Sí, publicar", "callback_data": "d:si"}, {"text": "Cancelar", "callback_data": "d:no"}]]}
        await m.answer(f"¿Publicar <b>{site.domain}</b> de nuevo con lo que hay en main?", reply_markup=_teclado(botones))

    @r.callback_query(F.data.startswith("d:"))
    async def deploy_respuesta(cb: CallbackQuery) -> None:
        await cb.message.edit_reply_markup(reply_markup=None)  # type: ignore[union-attr]
        if cb.data == "d:no":
            await cb.answer("Cancelado")
            return
        try:
            await asyncio.to_thread(github.disparar_deploy, site.site_id)
        except Exception as e:
            await cb.answer()
            await cb.message.answer(f"No se pudo iniciar el deploy: {e}")  # type: ignore[union-attr]
            return
        store.registrar("deploy_solicitado")
        await cb.answer("Deploy iniciado")
        await cb.message.answer("🚀 Deploy iniciado. Tarda unos 3 minutos; míralo con /estado.")  # type: ignore[union-attr]

    @r.callback_query(F.data.regexp(r"^p:[cie]:\d+$"))
    async def propuesta(cb: CallbackQuery, state: FSMContext) -> None:
        _, accion, ident = cb.data.split(":")  # type: ignore[union-attr]
        pid = int(ident)
        if accion == "e":
            p = store.propuesta(pid)
            if p is None or p.status != "pendiente":
                await cb.answer("Ya no está pendiente")
                await cb.message.edit_reply_markup(reply_markup=None)  # type: ignore[union-attr]
                return
            await state.set_state(Correccion.esperando)
            await state.update_data(pid=pid)
            await cb.answer()
            await cb.message.answer(  # type: ignore[union-attr]
                f"✏️ Envía el valor correcto, la fecha de vigencia o ambos.\nEj.: <code>1300.00 01/01/2027</code> · <code>1.37%</code> · <code>01/03/2027</code>\n/cancelar para salir."
            )
            return
        actual = store.propuesta(pid)
        confirmable = accion == "c" and actual is not None and actual.status == "pendiente"
        texto = acciones.confirmar_propuesta(store, pid) if accion == "c" else acciones.ignorar_propuesta(store, pid)
        await cb.message.edit_reply_markup(reply_markup=None)  # type: ignore[union-attr]
        await cb.answer()
        await cb.message.answer(texto)  # type: ignore[union-attr]
        if confirmable:
            await abrir_pr(cb.message, pid)  # type: ignore[arg-type]

    @r.callback_query(F.data.regexp(r"^r:\d+$"))
    async def reintentar_pr(cb: CallbackQuery) -> None:
        pid = int(cb.data.split(":")[1])  # type: ignore[union-attr]
        await cb.message.edit_reply_markup(reply_markup=None)  # type: ignore[union-attr]
        await cb.answer()
        p = store.propuesta(pid)
        if p is None or p.status != "confirmada" or store.pr(pid) is not None:
            await cb.message.answer(f"La propuesta #{pid} ya no necesita PR.")  # type: ignore[union-attr]
            return
        await abrir_pr(cb.message, pid)  # type: ignore[arg-type]

    @r.callback_query(F.data.regexp(r"^[mx]:\d+$"))
    async def publicar_o_descartar(cb: CallbackQuery) -> None:
        accion, ident = cb.data.split(":")  # type: ignore[union-attr]
        await cb.message.edit_reply_markup(reply_markup=None)  # type: ignore[union-attr]
        await cb.answer("Publicando…" if accion == "m" else "Descartando…")
        try:
            if accion == "m":
                texto = await asyncio.to_thread(publicacion.publicar, store, int(ident), hoy=hoy())
            else:
                texto = await asyncio.to_thread(publicacion.descartar, store, int(ident))
        except (params_pr.AplicarError, github.GitHubError) as e:
            texto = f"⚠️ {escape(str(e))}"
        await cb.message.answer(texto, disable_web_page_preview=True)  # type: ignore[union-attr]

    @r.callback_query(F.data.regexp(r"^b:[ad]:\d+$"))
    async def borrador_respuesta(cb: CallbackQuery) -> None:
        _, accion, ident = cb.data.split(":")  # type: ignore[union-attr]
        texto = acciones.aprobar_borrador(store, int(ident)) if accion == "a" else acciones.descartar_borrador(store, int(ident))
        await cb.message.edit_reply_markup(reply_markup=None)  # type: ignore[union-attr]
        await cb.answer()
        await cb.message.answer(texto)  # type: ignore[union-attr]

    @r.message(Correccion.esperando, F.text & ~F.text.startswith("/"))
    async def correccion(m: Message, state: FSMContext) -> None:
        pid = (await state.get_data())["pid"]
        try:
            texto = acciones.corregir_propuesta(store, pid, m.text or "")
        except ValueError as e:
            await m.answer(f"{e}\nInténtalo de nuevo o /cancelar.")
            return
        await state.clear()
        p = store.propuesta(pid)
        await m.answer(texto)
        await m.answer(tarjetas.texto_propuesta(p), reply_markup=_teclado(tarjetas.botones_propuesta(p)), disable_web_page_preview=True)  # type: ignore[arg-type]

    @r.message()
    async def otro(m: Message) -> None:
        await m.answer("No entendí. Usa /ayuda para ver los comandos.")

    return r


async def _correr(site: Site) -> None:
    bot = Bot(site.telegram_token, default=DefaultBotProperties(parse_mode=ParseMode.HTML))
    dp = Dispatcher()
    dp.update.outer_middleware(SoloAdmin(site.telegram_admin_chat_id))
    dp.include_router(crear_router(site, Store.del_site(site.site_id)))
    await bot.set_my_commands(COMANDOS)
    log.info("Bot de %s en marcha", site.domain)
    await dp.start_polling(bot, allowed_updates=dp.resolve_used_update_types())


def ejecutar(site: Site) -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
    asyncio.run(_correr(site))

import { getCollection, type CollectionEntry } from "astro:content";

/** MOSTRAR_BORRADORES=1 muestra los borradores (con aviso y sin indexar) para revisarlos antes de aprobar. */
export const mostrarBorradores = process.env.MOSTRAR_BORRADORES === "1";

export async function guiaDeCalculadora(id: string): Promise<CollectionEntry<"guias"> | undefined> {
  const guias = await getCollection("guias", (g) => g.data.calculadora === id && (g.data.estado === "aprobado" || mostrarBorradores));
  return guias[0];
}

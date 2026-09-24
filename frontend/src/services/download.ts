import { store } from "../store";
export async function download(path: string, filename: string) {
  const response = await fetch("/api/v1" + path, {
    headers: { Authorization: "Bearer " + store.getState().auth?.token },
  });
  if (!response.ok) throw new Error("Falha no download");
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

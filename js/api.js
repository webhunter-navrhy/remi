// Komunikace s AI přes náš Cloudflare Worker (zdrojový kód ve složce worker/)

export const API_URL = "https://remy-api.webhunter.workers.dev";

async function post(path, body, timeoutMs = 90000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(API_URL + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Chyba serveru (${res.status})`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

export const recognizeImage = (image) => post("/recognize", { image });

export const suggestRecipes = ({ ingredients, portions, note, exclude }) =>
  post("/recipes", { ingredients, portions, note, exclude, count: 3 });

// Fotky z mobilu mají klidně 5 MB — zmenšíme je v prohlížeči na max 1024 px
export function resizeImage(file, max = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.82));
    };
    img.onerror = () => reject(new Error("Fotku se nepodařilo načíst"));
    img.src = url;
  });
}

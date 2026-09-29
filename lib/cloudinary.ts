const CLOUD_NAME = process.env.NEXT_PUBLIC_CLOUDINARY_CLOUD_NAME;
const UPLOAD_PRESET = process.env.NEXT_PUBLIC_CLOUDINARY_UPLOAD_PRESET;

async function uploadImage(file: File, publicId: string): Promise<string> {
  if (!CLOUD_NAME || !UPLOAD_PRESET) throw new Error("IMAGE_UPLOAD_NOT_CONFIGURED");
  const form = new FormData();
  form.append("file", file);
  form.append("upload_preset", UPLOAD_PRESET);
  form.append("public_id", publicId);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/image/upload`, { method: "POST", body: form });
  if (!res.ok) throw new Error("IMAGE_UPLOAD_FAILED");
  const data = await res.json();
  return data.secure_url as string;
}

export async function uploadProductImage(file: File, shopId: string, productId: string): Promise<string> {
  return uploadImage(file, `shops/${shopId}/products/${productId}-${Date.now()}`);
}

export async function uploadShopImage(file: File, shopId: string, kind: "logo" | "cover"): Promise<string> {
  return uploadImage(file, `shops/${shopId}/brand/${kind}-${Date.now()}`);
}

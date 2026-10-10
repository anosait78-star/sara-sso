import * as DocumentPicker from 'expo-document-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from './supabase';

export type Source = 'camera' | 'gallery' | 'file';
export interface UploadTarget { id: string; customer_id: string; request_id: string | null; max_size_mb: number; allowed_mime: string[] }
export class UploadError extends Error {}

interface Picked { uri: string; mime: string; name: string; width?: number; height?: number }

async function pick(source: Source): Promise<Picked | null> {
  if (source === 'file') {
    const r = await DocumentPicker.getDocumentAsync({ type: ['application/pdf', 'image/*'], copyToCacheDirectory: true, multiple: false });
    const a = r.assets?.[0];
    return r.canceled || !a ? null : { uri: a.uri, mime: a.mimeType ?? 'application/pdf', name: a.name };
  }
  if (source === 'camera') {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) return null;
  }
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
  const r = source === 'camera' ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  const a = r.assets?.[0];
  return r.canceled || !a ? null : { uri: a.uri, mime: a.mimeType ?? 'image/jpeg', name: a.fileName ?? 'photo.jpg', width: a.width, height: a.height };
}

const MAX_WIDTH = 1600;

/** Phone photos are resized and re-encoded as JPEG before upload (PROJECT_PLAN §9.3: compress, heic -> jpg). */
async function compress(p: Picked): Promise<Picked> {
  if (!p.mime.startsWith('image/')) return p;
  const ctx = ImageManipulator.manipulate(p.uri);
  // explicit height: the web implementation cannot derive it from a null height
  if (p.width && p.height && p.width > MAX_WIDTH) {
    ctx.resize({ width: MAX_WIDTH, height: Math.round((p.height * MAX_WIDTH) / p.width) });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.7 });
  return { uri: saved.uri, mime: 'image/jpeg', name: p.name.replace(/\.\w+$/, '') + '.jpg' };
}

function randomId() {
  return Array.from({ length: 4 }, () => Math.random().toString(36).slice(2, 10)).join('');
}

/**
 * Picks a file, uploads it into {customer}/{request|general}/{document}/… in the private bucket,
 * then registers it (the database checks path, type and size again). Returns false when cancelled.
 */
export async function pickAndUpload(target: UploadTarget, source: Source): Promise<boolean> {
  const picked = await pick(source);
  if (!picked) return false;
  const file = await compress(picked);
  const body = await (await fetch(file.uri)).arrayBuffer();
  if (!target.allowed_mime.includes(file.mime)) throw new UploadError('type');
  if (body.byteLength > target.max_size_mb * 1024 * 1024) throw new UploadError('size');

  const ext = file.mime === 'application/pdf' ? 'pdf' : file.mime.split('/')[1] ?? 'jpg';
  const path = `${target.customer_id}/${target.request_id ?? 'general'}/${target.id}/${Date.now()}-${randomId()}.${ext}`;
  const { error: upErr } = await supabase.storage.from('customer-documents').upload(path, body, { contentType: file.mime, upsert: false });
  if (upErr) throw upErr;
  const { error } = await supabase.rpc('register_document_upload', {
    p_document_id: target.id, p_path: path, p_original_name: file.name, p_mime: file.mime, p_size: body.byteLength,
  });
  if (error) throw error;
  return true;
}

import crypto from 'node:crypto';

const algo = 'aes-256-gcm';
const cipherSuffix = 'enc:v1:';

const getKey = (): Buffer => {
 const raw = process.env.TOKEN_KEY;
 if (!raw) throw new Error('TOKEN_KEY is not set');

 const key = Buffer.from(raw, 'base64');
 if (key.length !== 32) {
  throw new Error('TOKEN_KEY must decode to 32 bytes (base64-encoded)');
 }
 return key;
};

export const isEncrypted = (value: string): boolean => value.startsWith(cipherSuffix);

export const encrypt = (plaintext: string): string => {
 const iv = crypto.randomBytes(12);
 const cipher = crypto.createCipheriv(algo, getKey(), iv);
 const enc = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
 const tag = cipher.getAuthTag();

 return `${cipherSuffix}${iv.toString('base64')}:${tag.toString('base64')}:${enc.toString('base64')}`;
};

export const decrypt = (value: string): string => {
 if (!isEncrypted(value)) return value;

 const [, , ivB64, tagB64, dataB64] = value.split(':');
 const decipher = crypto.createDecipheriv(algo, getKey(), Buffer.from(ivB64, 'base64'));
 decipher.setAuthTag(Buffer.from(tagB64, 'base64'));

 return Buffer.concat([
  decipher.update(Buffer.from(dataB64, 'base64')),
  decipher.final(),
 ]).toString('utf8');
};

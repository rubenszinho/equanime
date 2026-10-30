// Test files are read as text; Lattes exports ISO-8859-1 bytes.
export const latin1 = (text: string) => Uint8Array.from(text, (char) => char.charCodeAt(0));

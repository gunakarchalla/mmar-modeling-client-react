/**
 * Port of the old modeling `resources/services/file_utility.ts` (plan §10: ★
 * modeling-unique — do NOT copy the metamodeling twin, whose FileUtility is a
 * different UUID->content cache). This one is a pure, dependency-free helper for
 * converting between browser `File` objects and data-URL strings / server buffers.
 * It is consumed by `meta-utility` (bufferToFile) and `expression-utility`
 * (FiletoDataUrl / arrayBuffer paths).
 *
 * DEVIATION (recorded in state.json): the original `FiletoDataUrl` used Node's
 * `Buffer.from(...).toString('base64')`. `Buffer` is not available in the Vite
 * browser bundle (no node polyfills — plan §10) and there is no @types/node, so it
 * is re-implemented with a `FileReader.readAsDataURL`, which yields the exact same
 * `data:<mime>;base64,<...>` string the original produced.
 */
export class FileUtility {
  async DataUrltoFile(url: string, filename: string, mimeType?: string): Promise<File> {
    if (url.startsWith("data:")) {
      const arr = url.split(",");
      const mimeMatch = arr[0].match(/:(.*?);/);
      const mime = mimeMatch ? mimeMatch[1] : "";
      const bstr = atob(arr[arr.length - 1]);
      let n = bstr.length;
      const u8arr = new Uint8Array(n);
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
      }
      const file = new File([u8arr], filename, { type: mime || mimeType });
      return Promise.resolve(file);
    }
    return fetch(url)
      .then((res) => res.arrayBuffer())
      .then((buf) => new File([buf], filename, { type: mimeType }));
  }

  async FiletoDataUrl(file: File): Promise<string> {
    // Browser-native equivalent of the original `data:${file.type};base64,${base64}`
    // build, avoiding Node's Buffer (see the DEVIATION note in the file header).
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(typeof reader.result === "string" ? reader.result : "");
      reader.onerror = (error) => reject(error);
      reader.readAsDataURL(file);
    });
  }

  bufferToFile(
    bufferObj: { data: number[] },
    filename: string,
    mimeType: string,
    creationTime: string | number | Date,
    modificationTime: string | number | Date,
  ): File {
    // Convert numeric data array into a Uint8Array
    const uint8Array = new Uint8Array(bufferObj.data);

    // Create a Blob from the binary data
    const blob = new Blob([uint8Array], { type: mimeType });

    // Parse modificationTime into a timestamp for lastModified
    const lastModified = new Date(modificationTime).getTime();

    // Construct the File, setting its MIME type and lastModified timestamp
    const file = new File([blob], filename, { type: mimeType, lastModified });

    // Attach creationTime as a non-standard, read-only property
    Object.defineProperty(file, "creationTime", {
      value: new Date(creationTime),
      writable: false,
      enumerable: true,
    });

    return file;
  }
}

// Module singleton (replaces the Aurelia @singleton() DI registration).
export const fileUtility = new FileUtility();

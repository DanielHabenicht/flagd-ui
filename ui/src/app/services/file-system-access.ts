import { Injectable } from '@angular/core';
import { FlagFileContent } from '../models/flag.models';

interface WritableFileStream {
  write: (data: string) => Promise<void>;
  close: () => Promise<void>;
}

interface FileHandle {
  getFile: () => Promise<File>;
  createWritable: () => Promise<WritableFileStream>;
}

type WindowWithFilePicker = Window & {
  showOpenFilePicker?: (options?: unknown) => Promise<FileHandle[]>;
};

@Injectable({ providedIn: 'root' })
export class FileSystemAccess {
  private readonly fileHandles = new Map<string, FileHandle>();

  isOpenFilePickerSupported(): boolean {
    if (typeof window === 'undefined') {
      return false;
    }

    return typeof (window as WindowWithFilePicker).showOpenFilePicker === 'function';
  }

  async pickAndBindFlagsFile(): Promise<{ name: string; content: string } | null> {
    const picker = (window as WindowWithFilePicker).showOpenFilePicker;
    if (!picker) {
      throw new Error('File picker API is not supported in this browser.');
    }

    const [handle] = await picker({
      multiple: false,
      excludeAcceptAllOption: false,
      types: [
        {
          description: 'JSON files',
          accept: {
            'application/json': ['.json', '.flagd.json'],
          },
        },
      ],
    });

    if (!handle) {
      return null;
    }

    const file = await handle.getFile();
    const text = await file.text();
    const content = JSON.parse(text) as FlagFileContent;

    if (!content.flags || typeof content.flags !== 'object' || Array.isArray(content.flags)) {
      throw new Error('Invalid flags file: missing "flags" object.');
    }

    let name = file.name.replace(/\.flagd\.json$/, '').replace(/\.json$/, '');
    if (!name) {
      name = 'imported';
    }

    this.fileHandles.set(name, handle);

    return { name, content: text };
  }

  async persistBoundFlagsFile(name: string, content: FlagFileContent): Promise<void> {
    const handle = this.fileHandles.get(name);
    if (!handle) {
      return;
    }

    const writable = await handle.createWritable();
    await writable.write(JSON.stringify(content, null, 2));
    await writable.close();
  }

  async readBoundFlagsFiles(): Promise<Array<{ name: string; content: FlagFileContent }>> {
    const results: Array<{ name: string; content: FlagFileContent }> = [];

    for (const [name, handle] of this.fileHandles.entries()) {
      try {
        const file = await handle.getFile();
        const text = await file.text();
        const content = JSON.parse(text) as FlagFileContent;

        if (!content.flags || typeof content.flags !== 'object' || Array.isArray(content.flags)) {
          continue;
        }

        results.push({ name, content });
      } catch {
        continue;
      }
    }

    return results;
  }

  unbindFlagsFile(name: string): void {
    this.fileHandles.delete(name);
  }
}

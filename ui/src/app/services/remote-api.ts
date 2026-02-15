import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { map, Observable } from 'rxjs';
import { FlagFileContent } from '../models/flag.models';

@Injectable({ providedIn: 'root' })
export class RemoteApi {
  private readonly http = inject(HttpClient);

  listFlagsFiles(backendUrl: string): Observable<string[]> {
    return this.http
      .get<{ files: string[] }>(`${backendUrl}/api/flags`)
      .pipe(map((res) => res.files ?? []));
  }

  getFlagsFile(backendUrl: string, name: string): Observable<FlagFileContent> {
    return this.http.get<FlagFileContent>(`${backendUrl}/api/flags/${encodeURIComponent(name)}`);
  }

  createFlagsFile(backendUrl: string, name: string, content: FlagFileContent): Observable<unknown> {
    return this.http.post(`${backendUrl}/api/flags`, { name, ...content });
  }

  updateFlagsFile(backendUrl: string, name: string, content: FlagFileContent): Observable<unknown> {
    return this.http.put(`${backendUrl}/api/flags/${encodeURIComponent(name)}`, content);
  }

  deleteFlagsFile(backendUrl: string, name: string): Observable<unknown> {
    return this.http.delete(`${backendUrl}/api/flags/${encodeURIComponent(name)}`);
  }
}

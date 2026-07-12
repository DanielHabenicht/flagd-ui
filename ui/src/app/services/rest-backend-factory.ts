import { HttpClient } from '@angular/common/http';
import { inject, Injectable } from '@angular/core';
import { CollectionsService } from '../api-client/api/collections.service';
import { EnvironmentsService } from '../api-client/api/environments.service';
import { FlagsService } from '../api-client/api/flags.service';
import { SchemaService } from '../api-client/api/schema.service';
import { TimewindowsService } from '../api-client/api/timewindows.service';
import { RestFlagBackend } from './rest-flag-backend';

/**
 * Builds (and caches) a {@link RestFlagBackend} per base URL. Each backend owns
 * its own generated service instances bound to that URL, so requests to
 * different servers never share mutable state and can run in parallel.
 */
@Injectable({ providedIn: 'root' })
export class RestBackendFactory {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, RestFlagBackend>();

  forBaseUrl(baseUrl: string): RestFlagBackend {
    let backend = this.cache.get(baseUrl);
    if (!backend) {
      backend = new RestFlagBackend(
        new CollectionsService(this.http, baseUrl),
        new FlagsService(this.http, baseUrl),
        new EnvironmentsService(this.http, baseUrl),
        new TimewindowsService(this.http, baseUrl),
        new SchemaService(this.http, baseUrl),
      );
      this.cache.set(baseUrl, backend);
    }
    return backend;
  }
}

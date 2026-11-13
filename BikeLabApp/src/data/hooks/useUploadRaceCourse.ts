import { useMutation } from '@tanstack/react-query';
import type { AttachedRoute } from '@bikelab/shared/types';
import { api, raceCourses } from '../api';
import type { RouteFile } from '../../utils/pickRouteFile';

/**
 * POST /api/race-courses — sends a route file (GPX / FIT) and gets back what
 * the coach is told about it: the course id, its length, climbing and
 * climbs. The server keeps the course; the coach plans it with plan_race.
 */
export function useUploadRaceCourse() {
  return useMutation({
    mutationFn: (file: RouteFile): Promise<AttachedRoute> => {
      const form = new FormData();
      // React Native's FormData takes a file as {uri, name, type}.
      form.append('file', {
        uri: file.uri,
        name: file.name,
        type: file.type,
      } as unknown as Blob);
      // A multipart endpoint takes the FormData itself as its body (shared
      // callEndpoint); its zod `body` type describes fields, not the form.
      return api.call(raceCourses.upload, {
        body: form as unknown as Record<string, unknown>,
      });
    },
  });
}

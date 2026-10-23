// Local playtesting is explicit and never changes the recorded rights status.
export function localContentPreview() {
  if (process.env.LOCAL_CONTENT_PREVIEW !== 'true') return false;
  try {
    const origin = new URL(process.env.WEB_ORIGIN ?? 'http://localhost:3000');
    return ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  } catch {
    return false;
  }
}
export function approvalWhere() {
  return {
    editorialStatus: {
      in: ['approved', 'automated'] as ('approved' | 'automated')[],
    },
    ...(localContentPreview()
      ? {
          rightsStatus: {
            in: ['unreviewed', 'approved'] as ('unreviewed' | 'approved')[],
          },
        }
      : {
          rightsStatus: 'approved' as const,
          permissionReference: { not: null },
        }),
  };
}

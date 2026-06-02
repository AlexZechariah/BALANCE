export const Actions = {
  read: 'read',
  create: 'create',
  update: 'update',
  delete: 'delete',
  submit: 'submit',
  review: 'review',
  approve: 'approve',
  reject: 'reject',
  assign: 'assign',
  retryExtraction: 'retryExtraction',
  preview: 'preview',
  download: 'download',
  manage: 'manage'
} as const;

export type AppAction = (typeof Actions)[keyof typeof Actions];

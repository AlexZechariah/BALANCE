export const Subjects = {
  Document: 'Document',
  DocumentField: 'DocumentField',
  ExtractionJob: 'ExtractionJob',
  ExtractionArtifact: 'ExtractionArtifact',
  Claim: 'Claim',
  Review: 'Review',
  Budget: 'Budget',
  AuditEvent: 'AuditEvent',
  Organization: 'Organization',
  Membership: 'Membership',
  StorageObject: 'StorageObject',
  User: 'User',
  Session: 'Session'
} as const;

export type AppSubject = (typeof Subjects)[keyof typeof Subjects];
export type AppSubjectType = AppSubject | 'all';

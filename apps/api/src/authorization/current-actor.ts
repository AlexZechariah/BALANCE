import type { Role } from '@balance/db';

export type CurrentActor = {
  id: string;
  email: string;
  role: Role | string;
  organizationId: string | null;
};

export type ActorContext = {
  actorId: string;
  actorRole: Role | string;
  organizationId?: string | null;
};

export function currentActorFromUser(user: CurrentActor): ActorContext {
  return {
    actorId: user.id,
    actorRole: user.role,
    organizationId: user.organizationId
  };
}

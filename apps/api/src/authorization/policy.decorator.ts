import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

import type { AppAbility } from './ability.factory';
import type { CurrentActor } from './current-actor';

export type PolicyHandler = (ability: AppAbility, actor: CurrentActor, request: Request) => boolean;

export const POLICY_HANDLERS_KEY = 'balance:policy-handlers';

export const CheckPolicies = (...handlers: PolicyHandler[]) => SetMetadata(POLICY_HANDLERS_KEY, handlers);

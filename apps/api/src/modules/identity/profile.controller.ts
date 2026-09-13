import { Body, Controller, Get, Inject, Post } from '@nestjs/common';
import { CurrentActor } from './auth.guard';
import { MyProfile, ProfileService, ProfileUpdate } from './profile.service';
import { Actor } from './types';

/**
 * The signed-in person's own profile. No id in any route: it is always
 * the actor's (CLAUDE.md #28).
 */
@Controller('me/profile')
export class ProfileController {
  constructor(@Inject(ProfileService) private readonly profiles: ProfileService) {}

  @Get()
  async get(@CurrentActor() actor: Actor): Promise<MyProfile> {
    return this.profiles.get(actor.userId);
  }

  @Post()
  async update(@CurrentActor() actor: Actor, @Body() body: ProfileUpdate): Promise<MyProfile> {
    return this.profiles.update(actor.userId, actor.role, body ?? {});
  }
}

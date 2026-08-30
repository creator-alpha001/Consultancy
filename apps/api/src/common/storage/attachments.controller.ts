import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { CurrentActor, Public } from '../../modules/identity/auth.guard';
import { Actor } from '../../modules/identity/types';
import { AttachmentService, SIGNED_URL_TTL_SECONDS } from './attachment.service';

/**
 * Uploading and reading private files.
 *
 * The upload body is base64 rather than multipart on purpose: multipart
 * would mean a body parser with its own size handling in front of the
 * size check, and the limit here is the point. A real deployment would
 * put a presigned direct-to-bucket upload in front of this; the access
 * model below is the part that must not change when it does.
 */
@Controller('attachments')
export class AttachmentsController {
  constructor(@Inject(AttachmentService) private readonly attachments: AttachmentService) {}

  @Post()
  async upload(
    @CurrentActor() actor: Actor,
    @Body() body: { contentBase64?: string; contentType?: string; filename?: string },
  ): Promise<{ id: string; byteSize: number; sha256: string }> {
    if (!body.contentBase64) throw new BadRequestException('contentBase64 is required');
    if (!body.contentType) throw new BadRequestException('contentType is required');

    const bytes = Buffer.from(body.contentBase64, 'base64');
    if (bytes.byteLength === 0) throw new BadRequestException('the file is empty');

    const row = await this.attachments.upload({
      // Never a body field: the uploader is the session's actor (#28).
      ownerId: actor.userId,
      bytes,
      contentType: body.contentType,
      originalFilename: body.filename,
    });
    return { id: row.id, byteSize: row.byteSize, sha256: row.sha256 };
  }

  /**
   * A fresh five-minute link for this viewer.
   *
   * Deliberately a POST-less GET that mints something short-lived rather
   * than a permanent URL stored anywhere: there is no such thing as a
   * durable link to a private document here.
   */
  @Get(':id/link')
  async link(
    @Param('id') id: string,
    @CurrentActor() actor: Actor,
  ): Promise<{ url: string; expiresAt: string; expiresInSeconds: number; watermark: string }> {
    const link = await this.attachments.signedUrlFor(id, { id: actor.userId, label: actor.userId });
    return {
      url: link.url,
      expiresAt: link.expiresAt.toISOString(),
      expiresInSeconds: SIGNED_URL_TTL_SECONDS,
      watermark: link.watermark,
    };
  }

  /**
   * Redeeming a link.
   *
   * `@Public()` because the token is the authorisation — but the token
   * names the viewer, and the grant is re-checked here rather than
   * trusted from issue time, so this is not an unauthenticated route in
   * any meaningful sense. It is one where the credential arrives in the
   * URL instead of a header, which is what a signed URL is.
   */
  @Get(':id/download')
  @Public()
  async download(
    @Param('id') id: string,
    @Query('token') token: string,
    @Res() res: Response,
  ): Promise<void> {
    if (!token) throw new BadRequestException('token is required');
    const { attachment, bytes, viewerId } = await this.attachments.resolveToken(id, token);

    res.setHeader('Content-Type', attachment.contentType);
    res.setHeader('Content-Length', String(bytes.byteLength));
    // Never inline: a private document rendered in the page frame is one
    // browser bug away from being readable by whatever else is on it.
    res.setHeader('Content-Disposition', 'attachment');
    res.setHeader('Cache-Control', 'no-store, private');
    // Who this copy was served to. Not a substitute for burning it into
    // the document — see the note in AttachmentService.
    res.setHeader('X-Served-To', viewerId);
    res.end(bytes);
  }
}

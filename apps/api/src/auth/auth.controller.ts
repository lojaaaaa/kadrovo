import {
  BadRequestException,
  NotFoundException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { z } from 'zod';
import { AuthService } from './auth.service';
import { OAuthService, providerSchema } from './oauth.service';
import {
  cookie,
  RateLimit,
  sameOrigin,
  setCookie,
  webOrigin,
} from './security';
const email = z
  .email()
  .max(254)
  .transform((v) => v.trim().toLowerCase());
const password = z.string().min(10).max(128);
const credentials = z.object({ email, password });
const token = z.string().regex(/^[a-f0-9]{64}$/);
const parse = <T>(schema: z.ZodType<T>, input: unknown): T => {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new BadRequestException(
      'Проверьте поля. Пароль — от 10 до 128 символов.',
    );
  return result.data;
};
@Controller('auth')
export class AuthController {
  private limits = new RateLimit();
  constructor(
    @Inject(AuthService) private readonly auth: AuthService,
    @Inject(OAuthService) private readonly oauth: OAuthService,
  ) {}
  private guard(req: Request, res: Response) {
    res.setHeader('Cache-Control', 'no-store');
    sameOrigin(req);
    this.limits.take(`ip:${req.ip}`, 60);
  }
  @Get('me') async me(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    return {
      account: await this.auth.session(cookie(req, 'filmless_session')),
      providers: this.auth.providers(),
    };
  }
  @Post('profile') async profile(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    const account = await this.auth.require(cookie(req, 'filmless_session'));
    const input = z
      .object({ nickname: z.string().trim().min(1).max(24) })
      .safeParse(body);
    if (!input.success)
      throw new BadRequestException(
        'Ник должен содержать от 1 до 24 символов.',
      );
    return {
      account: await this.auth.updateProfile(account.id, input.data.nickname),
    };
  }
  @Post('avatar') async uploadAvatar(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    const account = await this.auth.require(cookie(req, 'filmless_session'));
    this.limits.take(`avatar:${account.id}`, 10);
    const input = z
      .object({ image: z.string().max(80000).nullable() })
      .safeParse(body);
    if (!input.success)
      throw new BadRequestException(
        'Изображение слишком большое. Выберите другое.',
      );
    return {
      account: await this.auth.updateAvatar(account.id, input.data.image),
    };
  }
  @Get('avatar/:id') async avatar(
    @Param('id') id: string,
    @Res() res: Response,
  ) {
    if (!z.uuid().safeParse(id).success) throw new NotFoundException();
    const image = await this.auth.avatar(id);
    if (!image) throw new NotFoundException();
    res.setHeader('Cache-Control', 'public, max-age=3600');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.type('image/webp').send(Buffer.from(image));
  }
  @Post('register') async register(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    const data = parse(
      credentials.extend({ nickname: z.string().trim().min(1).max(24) }),
      body,
    );
    this.limits.take(`mail:${data.email}`, 3);
    return this.auth.register(data.email, data.password, data.nickname);
  }
  @Post('login') async login(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    const data = parse(credentials, body);
    this.limits.take(`login:${data.email}`, 10);
    const result = await this.auth.login(data.email, data.password);
    setCookie(res, 'filmless_session', result.token, 30 * 86400_000);
    return { account: result.account };
  }
  @Post('logout') async logout(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    await this.auth.logout(cookie(req, 'filmless_session'));
    setCookie(res, 'filmless_session', '', 0);
    return { ok: true };
  }
  @Post('forgot') async forgot(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    const data = parse(z.object({ email }), body);
    this.limits.take(`mail:${data.email}`, 3);
    return this.auth.forgot(data.email);
  }
  @Post('verify') verify(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    return this.auth.consume(parse(z.object({ token }), body).token, 'verify');
  }
  @Post('reset') reset(
    @Body() body: unknown,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    this.guard(req, res);
    const data = parse(z.object({ token, password }), body);
    return this.auth.consume(data.token, 'reset', data.password);
  }
  @Get('oauth/:provider') async begin(
    @Param('provider') input: string,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    this.limits.take(`oauth:${req.ip}`, 20);
    const provider = parse(providerSchema, input);
    const result = await this.oauth.start(provider);
    setCookie(res, `filmless_oauth_${provider}`, result.state, 600_000);
    res.setHeader('Cache-Control', 'no-store');
    res.redirect(result.url);
  }
  @Get('oauth/:provider/callback') async callback(
    @Param('provider') input: string,
    @Query() query: Record<string, unknown>,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    res.setHeader('Cache-Control', 'no-store');
    const provider = parse(providerSchema, input);
    const stateCookie = cookie(req, `filmless_oauth_${provider}`);
    setCookie(res, `filmless_oauth_${provider}`, '', 0);
    try {
      const data = parse(
        z.object({ state: token, code: z.string().max(2048) }),
        query,
      );
      const session = await this.oauth.finish(
        provider,
        data.state,
        stateCookie,
        data.code,
      );
      setCookie(res, 'filmless_session', session, 30 * 86400_000);
      res.redirect(`${webOrigin()}/battle`);
    } catch {
      res.redirect(`${webOrigin()}/account?error=oauth`);
    }
  }
}

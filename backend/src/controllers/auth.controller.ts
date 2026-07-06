import { Request, Response } from 'express';
import { IUser, User } from '../models/User';
import { hashPassword, comparePassword } from '../services/auth/password.service';
import { generateAccessToken, generateRefreshToken, verifyRefreshToken } from '../services/auth/token.service';
import { AppError } from '../utils/AppError';

function issueTokens(user: IUser): { accessToken: string; refreshToken: string } {
  const userId = user._id!.toString();
  return {
    accessToken: generateAccessToken({ sub: userId, role: user.role }),
    refreshToken: generateRefreshToken({ sub: userId, tokenVersion: user.tokenVersion }),
  };
}

function toPublicUser(user: IUser) {
  return { id: user._id, email: user.email, alias: user.alias, role: user.role };
}

export async function register(req: Request, res: Response): Promise<void> {
  const { email, password, alias } = req.body as { email?: string; password?: string; alias?: string };

  if (!email || !password || !alias) {
    throw new AppError('email, password y alias son obligatorios', 400);
  }
  if (password.length < 8) {
    throw new AppError('La contraseña debe tener al menos 8 caracteres', 400);
  }

  const existing = await User.findOne({ email: email.toLowerCase() });
  if (existing) {
    throw new AppError('Ya existe una cuenta con ese email', 409);
  }

  const hashedPassword = await hashPassword(password);
  const user = await User.create({ email, password: hashedPassword, alias });

  res.status(201).json({ user: toPublicUser(user), ...issueTokens(user) });
}

export async function login(req: Request, res: Response): Promise<void> {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) {
    throw new AppError('email y password son obligatorios', 400);
  }

  const user = await User.findOne({ email: email.toLowerCase() });
  if (!user || !(await comparePassword(password, user.password))) {
    throw new AppError('Credenciales inválidas', 401);
  }

  res.json({ user: toPublicUser(user), ...issueTokens(user) });
}

export async function refresh(req: Request, res: Response): Promise<void> {
  const { refreshToken } = req.body as { refreshToken?: string };
  if (!refreshToken) {
    throw new AppError('refreshToken es obligatorio', 400);
  }

  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new AppError('Refresh token inválido o expirado', 401);
  }

  const user = await User.findById(payload.sub);
  if (!user || user.tokenVersion !== payload.tokenVersion) {
    throw new AppError('Refresh token inválido', 401);
  }

  const accessToken = generateAccessToken({ sub: user._id!.toString(), role: user.role });
  res.json({ accessToken });
}

export async function logout(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError('No autenticado', 401);
  }

  // Invalida de golpe todos los refresh tokens ya emitidos para este usuario.
  await User.findByIdAndUpdate(req.user.id, { $inc: { tokenVersion: 1 } });
  res.status(204).send();
}

export async function me(req: Request, res: Response): Promise<void> {
  if (!req.user) {
    throw new AppError('No autenticado', 401);
  }

  const user = await User.findById(req.user.id);
  if (!user) {
    throw new AppError('Usuario no encontrado', 404);
  }

  res.json({ user: toPublicUser(user) });
}

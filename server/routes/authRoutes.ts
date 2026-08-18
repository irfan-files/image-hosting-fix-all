import { Router, Request, Response } from 'express';
import { db } from '../db/database';

export const authRouter = Router();

authRouter.post('/login', (req: Request, res: Response) => {
  const { email, name } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'Email is required' });
  }

  let user = db.getUserByEmail(email);
  if (!user) {
    user = db.createUser(email, name || email.split('@')[0]);
  }

  return res.json({
    message: 'Login successful',
    user
  });
});

authRouter.get('/me', (req: Request, res: Response) => {
  const users = db.getUsers();
  if (users.length > 0) {
    return res.json({ user: users[0] });
  }
  return res.json({ user: null });
});

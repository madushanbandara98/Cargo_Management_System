import dotenv from 'dotenv';
import bcrypt from 'bcryptjs';
import { connectMongo, disconnectMongo } from '../server/mongo/connection.js';
import { User } from '../server/mongo/models.js';

dotenv.config({ path: ['.env.local', '.env'] });

function prompt(text, { hidden = false } = {}) {
  if (!process.stdin.isTTY || !process.stdout.isTTY) {
    throw new Error('Password reset must be run from an interactive terminal.');
  }
  return new Promise((resolve, reject) => {
    let value = '';
    const input = process.stdin;
    const output = process.stdout;
    const previousRawMode = input.isRaw;
    const finish = (error = null) => {
      input.off('data', onData);
      input.setRawMode(Boolean(previousRawMode));
      input.pause();
      output.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = chunk => {
      for (const character of String(chunk)) {
        if (character === '\u0003') return finish(new Error('Password reset cancelled.'));
        if (character === '\r' || character === '\n') return finish();
        if (character === '\u007f' || character === '\b') {
          if (value) {
            value = value.slice(0, -1);
            output.write('\b \b');
          }
          continue;
        }
        if (character >= ' ') {
          value += character;
          output.write(hidden ? '*' : character);
        }
      }
    };
    output.write(text);
    input.setEncoding('utf8');
    input.setRawMode(true);
    input.resume();
    input.on('data', onData);
  });
}

async function resetAdministratorPassword() {
  const username = (await prompt('Administrator username [admin]: ')).trim() || 'admin';
  const newPassword = await prompt('New password: ', { hidden: true });
  if (newPassword.length < 8) throw new Error('New password must have at least 8 characters.');
  const confirmation = await prompt('Confirm new password: ', { hidden: true });
  if (newPassword !== confirmation) throw new Error('Passwords do not match.');

  await connectMongo();
  const administrator = await User.findOne({ username: new RegExp(`^${username.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i'), role: { $in: ['OWNER', 'ADMIN'] } }).select('+passwordHash');
  if (!administrator) throw new Error(`Administrator account "${username}" was not found.`);
  administrator.passwordHash = bcrypt.hashSync(newPassword, 12);
  administrator.sessionVersion = Number(administrator.sessionVersion || 0) + 1;
  await administrator.save();
  process.stdout.write(`Password reset for administrator "${administrator.username}". All existing sessions are now invalid.\n`);
}

try {
  await resetAdministratorPassword();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
} finally {
  await disconnectMongo();
}

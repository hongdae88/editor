import type {
  ShallotRawHandler,
  TShallotHttpEvent,
} from '@shallot/rest-wrapper/dist/aws';

import { ShallotAWSRestWrapper } from '@shallot/rest-wrapper';
import createHTTPError from 'http-errors';

import { createUser, DUser, getUser } from '../db/pgsql/models/User';
import { getDevToken } from './token';

interface DevLogin {
  tokenType: 'dev';
  email: string;
  name?: string;
}

interface GoogleLogin {
  tokenType: 'google';
  idToken: string;
}

type TEvent = TShallotHttpEvent<unknown, unknown, unknown, DevLogin | GoogleLogin>;
type TResult = { accessToken: string };

const _handler: ShallotRawHandler<TEvent, { accessToken: string; user: DUser }> = async ({
  body,
}) => {
  let accessToken: TResult['accessToken'];
  let user: DUser | null;
  switch (body?.tokenType) {
    case 'google': {
      throw new createHTTPError.BadRequest('google login method not implemented');
    }
    case 'dev': {
      if (process.env.IS_OFFLINE == null) {
        throw new createHTTPError.Unauthorized('Cannot use dev token in prod');
      }

      user = await getUser(body.email);

      if (user == null) {
        user = await createUser({ email: body.email, name: body.name });
      }

      accessToken = getDevToken(body.email);
      break;
    }
    default: {
      throw new createHTTPError.BadRequest('Invalid tokenType');
    }
  }

  return { message: 'success', data: { accessToken, user } };
};

export const handler = ShallotAWSRestWrapper(_handler, undefined, {
  HttpErrorHandlerOpts: { catchAllErrors: true },
});

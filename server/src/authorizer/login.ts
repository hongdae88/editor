import type {
  ShallotRawHandler,
  TShallotHttpEvent,
} from '@shallot/rest-wrapper/dist/aws';

import { ShallotAWSRestWrapper } from '@shallot/rest-wrapper';
import createHTTPError from 'http-errors';

import { createUser, DUser, getUser } from '../db/pgsql/models/User';
import { getDevToken, getProdToken } from './token';
import { validateGoogleIdToken } from './google';

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
type TResult = { sessionToken: string; user: DUser };

const getOrCreateGoogleAuthUser = async (
  idToken: GoogleLogin['idToken']
): Promise<TResult> => {
  const googleAuthInfo = await validateGoogleIdToken(idToken);
  if (googleAuthInfo == null) {
    throw new createHTTPError.BadRequest('Google Auth info could not be processed.');
  }

  const email = googleAuthInfo.email.toLowerCase().trim();
  let user = await getUser(email);

  if (user == null) {
    user = await createUser({ email, name: googleAuthInfo.name });

    if (user == null) {
      throw new createHTTPError.InternalServerError('Could not create user');
    }
  }

  const sessionToken = getProdToken(user.uid);
  return { sessionToken, user };
};

const _handler: ShallotRawHandler<TEvent, TResult> = async ({ body }) => {
  let loginData: TResult;
  switch (body?.tokenType) {
    case 'google': {
      loginData = await getOrCreateGoogleAuthUser(body.idToken);
      break;
    }
    case 'dev': {
      if (process.env.IS_OFFLINE == null) {
        throw new createHTTPError.Unauthorized('Cannot use dev token in prod');
      }

      const email = body.email.toLowerCase().trim();
      let user = await getUser(email);

      if (user == null) {
        user = await createUser({ email, name: body.name });

        if (user == null) {
          throw new createHTTPError.InternalServerError('Could not create user');
        }
      }

      loginData = { sessionToken: getDevToken(user.uid), user };
      break;
    }
    default: {
      throw new createHTTPError.BadRequest('Invalid tokenType');
    }
  }

  return { message: 'success', data: loginData };
};

export const handler = ShallotAWSRestWrapper(_handler, undefined, {
  HttpErrorHandlerOpts: { catchAllErrors: true },
});

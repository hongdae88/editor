import type {
  ShallotRawHandler,
  TShallotHttpEvent,
} from '@shallot/rest-wrapper/dist/aws';

import type { DUser } from '../db/pgsql/models/User';

import { ShallotAWSRestWrapper } from '@shallot/rest-wrapper';
import createHTTPError from 'http-errors';

import {
  DNotebookAccessLevel,
  getUserAccessLevel,
  grantAccessByEmail,
} from '../db/pgsql/models/NotebookAccessLevel';

interface RShareNotebook {
  email: DUser['email'];
  access_level: DNotebookAccessLevel['access_level'];
}

type TEvent = TShallotHttpEvent<
  { email: DUser['email'] },
  { nb_id: DNotebookAccessLevel['nb_id'] },
  unknown,
  RShareNotebook
>;

const _handler: ShallotRawHandler<TEvent, never> = async ({
  requestContext: { authorizer },
  pathParameters,
  body,
}) => {
  const user = authorizer as DUser | null;
  if (user?.uid == null) {
    throw new createHTTPError.Unauthorized();
  }

  if (pathParameters?.nb_id == null) {
    throw new createHTTPError.BadRequest('Must specify body.nb_id');
  }

  if (body?.email == null) {
    throw new createHTTPError.BadRequest('Must specify body.email');
  }

  if (body?.access_level == null) {
    throw new createHTTPError.BadRequest('Must specify body.access_level');
  }

  if (body.email === user.email) {
    throw new createHTTPError.BadRequest('Cannot grant access to yourself!');
  }

  // Assert that the request user has full access
  const requestingUserAccessLevel = await getUserAccessLevel(
    user.uid,
    pathParameters.nb_id
  );

  if (requestingUserAccessLevel !== 'Full Access') {
    throw new createHTTPError.Forbidden('Must have Full Access to share a notebook');
  }

  await grantAccessByEmail(body.email, pathParameters.nb_id, body.access_level);

  // TODO: Send an email to the user https://github.com/actually-colab/editor/issues/27

  return { message: 'success' };
};

export const handler = ShallotAWSRestWrapper(_handler, undefined, {
  HttpErrorHandlerOpts: { catchAllErrors: true },
  HttpCorsOpts: {
    allowHeaders: 'Authorization',
    allowedOrigins: ['http://localhost:4000', 'https://app.actuallycolab.org'],
  },
});

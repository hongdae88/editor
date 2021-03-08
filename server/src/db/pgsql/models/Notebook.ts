import type { DUser } from './User';

import pgsql from '../connection';
import tablenames from '../tablenames';

import { grantAccessByEmail, NotebookAccessLevel } from './NotebookAccessLevel';
import { DCell } from './Cell';

export interface DNotebook {
  nb_id: number;
  name: string;
  language: 'python2' | 'python3';
}

export interface Notebook extends DNotebook {
  users: NotebookAccessLevel[];
}

export interface NotebookContents extends Notebook {
  cells: DCell[];
}

export const createNotebook = async (
  notebook: Partial<DNotebook>,
  email: DUser['email']
): Promise<Notebook> => {
  // TODO: Use a transaction
  const notebookRecord: DNotebook = (
    await pgsql<DNotebook>(tablenames.notebooksTableName).insert(notebook).returning('*')
  )[0];

  const accessLevel = await grantAccessByEmail(
    email,
    notebookRecord.nb_id,
    'Full Access'
  );

  return {
    ...notebookRecord,
    users: [accessLevel],
  };
};

export const getNotebooksForUser = async (email: DUser['email']): Promise<Notebook[]> => {
  return pgsql
    .select(
      'nb.*',
      pgsql.raw(`json_agg(
        json_build_object(
          'uid', u.uid, 
          'email', u.email, 
          'name', u.name, 
          'access_level', nba.access_level
        )
      ) AS users`)
    )
    .from({ nb: tablenames.notebooksTableName })
    .innerJoin(
      { nba: tablenames.notebookAccessLevelsTableName },
      'nba.nb_id',
      '=',
      'nb.nb_id'
    )
    .innerJoin({ u: tablenames.usersTableName }, 'u.uid', '=', 'nba.uid')
    .whereIn(
      'nb.nb_id',
      pgsql
        .select('nb_id')
        .from({ sub_nba: tablenames.notebookAccessLevelsTableName })
        .innerJoin({ sub_u: tablenames.usersTableName }, 'sub_u.uid', '=', 'sub_nba.uid')
        .where({ 'sub_u.email': email })
    )
    .groupBy('nb.nb_id');
};

export const getNotebookContents = async (
  nb_id: DNotebook['nb_id']
): Promise<NotebookContents | null> => {
  console.log(
    await pgsql
      .select(
        'nb2.*',
        pgsql.raw(`json_agg(
              json_build_object(
                'cell_id', c.cell_id, 
                'time_modified', c.time_modified, 
                'language', c.language, 
                'contents', c.contents,
                'lock_held_by', c.lock_held_by
              )
            ) AS cells`)
      )
      .from({ nb2: tablenames.notebooksTableName })
      .leftJoin({ c: tablenames.cellsTableName }, 'c.nb_id', '=', 'nb2.nb_id')
      .where({ 'nb2.nb_id': nb_id })
      .groupBy('nb2.nb_id')
      .as('nb')
  );
  const notebooks = await pgsql
    .select(
      'nb.*',
      pgsql.raw(`json_agg(
        json_build_object(
          'uid', u.uid, 
          'email', u.email, 
          'name', u.name, 
          'access_level', nba.access_level
        )
      ) AS users`)
    )
    .from(
      pgsql
        .select(
          'nb2.*',
          pgsql.raw(`jsonb_agg(
              json_build_object(
                'cell_id', c.cell_id, 
                'time_modified', c.time_modified, 
                'language', c.language, 
                'contents', c.contents,
                'lock_held_by', c.lock_held_by
              )
            ) AS cells`)
        )
        .from({ nb2: tablenames.notebooksTableName })
        .leftJoin({ c: tablenames.cellsTableName }, 'c.nb_id', '=', 'nb2.nb_id')
        .where({ 'nb2.nb_id': nb_id })
        .groupBy('nb2.nb_id')
        .as('nb')
    )
    .innerJoin(
      { nba: tablenames.notebookAccessLevelsTableName },
      'nba.nb_id',
      '=',
      'nb.nb_id'
    )
    .innerJoin({ u: tablenames.usersTableName }, 'u.uid', '=', 'nba.uid')
    .where({ 'nb.nb_id': nb_id })
    .groupBy('nb.nb_id', 'nb.language', 'nb.name', 'nb.cells');

  if (notebooks.length === 0) {
    return null;
  }

  const notebook = notebooks[0];

  // Handle edge case of SQL json_agg null
  if (notebook.cells?.length === 1 && notebook.cells[0].cell_id == null) {
    notebook.cells = [];
  }

  return notebook;
};

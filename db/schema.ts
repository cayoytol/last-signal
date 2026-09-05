import { sqliteTable, text, integer, index, primaryKey, uniqueIndex } from 'drizzle-orm/sqlite-core';
export const rooms=sqliteTable('signal_rooms',{
 code:text('code').primaryKey(), state:text('state').notNull(), version:integer('version').notNull().default(0), updated:integer('updated').notNull(), created:integer('created').notNull(), expires:integer('expires').notNull(), owner:text('owner').notNull(),
},t=>[index('idx_signal_rooms_expires').on(t.expires),index('idx_signal_rooms_owner').on(t.owner)]);
export const players=sqliteTable('signal_players',{
 room:text('room').notNull().references(()=>rooms.code,{onDelete:'cascade'}), id:text('id').notNull(), slot:integer('slot').notNull(), name:text('name').notNull(), role:text('role').notNull(), token:text('token').notNull(), input:text('input').notNull(), seen:integer('seen').notNull(),
},t=>[primaryKey({columns:[t.room,t.id]}),uniqueIndex('idx_signal_player_slot').on(t.room,t.slot)]);

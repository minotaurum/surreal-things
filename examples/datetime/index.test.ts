import { test, expect, beforeAll, afterAll, describe } from "bun:test";
import { Surreal, Table, DateTime, type RecordId } from "surrealdb";
import { join } from "node:path";
import { createTestDb, expectThrows } from "../test-helper";

export type EventId = RecordId<"event">;

export interface Event {
  id: EventId;
  title: string;
  scheduled_at: DateTime | Date;
  created_at: DateTime;
  updated_at?: DateTime | Date;
}

describe("Datetime Field Example - SurrealDB JS Date handling", () => {
  let db: Surreal;
  const migrationPath = join(import.meta.dir, "migration.surql");
  const eventTable = new Table("event");

  beforeAll(async () => {
    db = await createTestDb(migrationPath);
  });

  afterAll(async () => {
    await db.close();
  });

  test("creates a record when scheduled_at is provided as a JS Date() object", async () => {
    const scheduledDate = new Date("2026-12-01T14:30:00.000Z");

    const [event] = await db.create<Event>(eventTable).content({
      title: "Tech Conference Keynote",
      scheduled_at: scheduledDate,
    });

    expect(event).toBeDefined();
    expect(event?.title).toBe("Tech Conference Keynote");

    // The SDK decodes SurrealDB datetime into a DateTime instance with nanosecond precision
    expect(event?.scheduled_at).toBeInstanceOf(DateTime);
    expect(event?.scheduled_at.toISOString()).toBe("2026-12-01T14:30:00.000Z");

    // Convert DateTime to native JS Date via .toDate()
    const jsDate = (event!.scheduled_at as DateTime).toDate();
    expect(jsDate).toBeInstanceOf(Date);
    expect(jsDate.getTime()).toBe(scheduledDate.getTime());

    // created_at was defaulted by SurrealQL DEFAULT time::now()
    expect(event?.created_at).toBeInstanceOf(DateTime);
    expect(event?.created_at.toDate()).toBeInstanceOf(Date);

    // Verify reading back with db.select() preserves DateTime
    const fetched = await db.select<Event>(event!.id);
    expect(fetched?.scheduled_at).toBeInstanceOf(DateTime);
    expect((fetched?.scheduled_at as DateTime).toDate().getTime()).toBe(scheduledDate.getTime());
  });

  test("rejects record creation when a string is passed instead of a JS Date() object", async () => {
    // SurrealDB SCHEMAFULL table with TYPE datetime enforces true datetime values.
    // The JS SDK expects a JS Date() object (or DateTime).
    // If a string (such as an ISO-8601 string) is sent, SurrealDB treats it as a string
    // and rejects it because 'string' does not match the schema's 'datetime' type.
    await expectThrows(() =>
      db.create<Event>(eventTable).content({
        title: "Invalid Datetime Event",
        // @ts-expect-error Testing runtime rejection when passing string instead of Date
        scheduled_at: "2026-12-01T14:30:00.000Z",
      })
    );
  });

  test("updates and merges datetime fields using JS Date() objects", async () => {
    const originalDate = new Date("2026-11-15T09:00:00.000Z");
    const [event] = await db.create<Event>(eventTable).content({
      title: "Team Standup",
      scheduled_at: originalDate,
    });

    const rescheduledDate = new Date("2026-11-15T11:00:00.000Z");
    const updatedAt = new Date();

    const updated = await db.update<Event>(event!.id).merge({
      scheduled_at: rescheduledDate,
      updated_at: updatedAt,
    });

    expect(updated?.scheduled_at).toBeInstanceOf(DateTime);
    expect(updated?.scheduled_at.toISOString()).toBe("2026-11-15T11:00:00.000Z");
    expect((updated?.scheduled_at as DateTime).toDate().getTime()).toBe(rescheduledDate.getTime());

    expect(updated?.updated_at).toBeInstanceOf(DateTime);
    expect((updated?.updated_at as DateTime)?.toDate().getTime()).toBe(updatedAt.getTime());

    // Merging with a string for a datetime field must fail
    await expectThrows(() =>
      db.update<Event>(event!.id).merge({
        // @ts-expect-error Testing runtime rejection when passing string instead of Date
        scheduled_at: "2026-11-15T12:00:00.000Z",
      })
    );
  });

  test("filters records using JS Date() objects as query parameters", async () => {
    const pastDate = new Date("2026-01-01T00:00:00.000Z");
    const futureDate = new Date("2026-12-31T23:59:59.000Z");

    await db.create<Event>(eventTable).content({
      title: "Past Hackathon",
      scheduled_at: pastDate,
    });

    await db.create<Event>(eventTable).content({
      title: "New Year Celebration",
      scheduled_at: futureDate,
    });

    const referenceDate = new Date("2026-06-01T00:00:00.000Z");

    // Passing a JS Date() object in query bindings serializes properly to datetime in SurrealDB
    const [futureEvents] = await db.query<[Event[]]>(
      `SELECT * FROM event WHERE scheduled_at > $refDate ORDER BY scheduled_at ASC;`,
      { refDate: referenceDate }
    );

    expect(futureEvents.length).toBeGreaterThanOrEqual(1);
    const titles = futureEvents.map((e) => e.title);
    expect(titles).toContain("New Year Celebration");
    expect(titles).not.toContain("Past Hackathon");

    for (const ev of futureEvents) {
      expect(ev.scheduled_at).toBeInstanceOf(DateTime);
      expect((ev.scheduled_at as DateTime).toDate().getTime()).toBeGreaterThan(referenceDate.getTime());
    }
  });

  test("supports also passing SDK DateTime instances directly", async () => {
    const dt = new DateTime("2026-12-25T18:00:00.000Z");
    const [event] = await db.create<Event>(eventTable).content({
      title: "Holiday Gala",
      scheduled_at: dt,
    });

    expect(event?.title).toBe("Holiday Gala");
    expect(event?.scheduled_at).toBeInstanceOf(DateTime);
    expect(event?.scheduled_at.toISOString()).toBe("2026-12-25T18:00:00.000Z");
  });
});

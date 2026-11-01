import { PrismaClient } from '@prisma/client';

// One-time dev-DB heal for the `thickness` OptionGroup collision.
//
// Two demo products shared one global OptionGroup code `thickness` with
// INCOMPATIBLE input kinds: the seeded "door" template needs a NUMBER (ranges +
// a volume formula), while the unseeded canvas "test_door" fixture needs a
// SELECT (discrete c_40/c_45/c_55 tree branches). A single OptionGroup can only
// be one kind, so the door seed now uses a distinct code `door_thickness`
// (see prisma/seed/configurator.ts).
//
// This script applies that split to the accumulated dev DB:
//   1. Delete the `door` ConfigTemplate so a re-seed rebuilds it from scratch
//      with `door_thickness` — the seed's find-then-create cannot heal the
//      changed ranges/constraint/formula JSON on existing rows. Children
//      (options, values, constraints, derived, pricing rules) cascade; the
//      template has no products or variants, and QuoteItem.template is SetNull.
//   2. Revert the global `thickness` group to a SELECT (its natural shape for
//      test_door). Nothing in the seeds defines `thickness` any more, so this
//      stays put across future re-seeds.
// Idempotent: safe to run more than once. Run `scripts/seed-demos.mts` after.
const prisma = new PrismaClient();

async function main() {
  const door = await prisma.configTemplate.findUnique({
    where: { code: 'door' },
    select: { id: true },
  });
  if (door) {
    await prisma.configTemplate.delete({ where: { id: door.id } });
    console.log('deleted door ConfigTemplate (will be rebuilt by seed with door_thickness)');
  } else {
    console.log('no door ConfigTemplate present (already rebuilt or fresh DB)');
  }

  const thickness = await prisma.optionGroup.findUnique({
    where: { code: 'thickness' },
    select: { id: true, inputKind: true },
  });
  if (thickness) {
    if (thickness.inputKind !== 'select') {
      await prisma.optionGroup.update({
        where: { id: thickness.id },
        data: { inputKind: 'select', unit: null },
      });
      console.log(`reverted 'thickness' group ${thickness.inputKind} -> select (for test_door)`);
    } else {
      console.log("'thickness' group already a select");
    }
  } else {
    console.log("no 'thickness' group present");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());

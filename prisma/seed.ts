import { PrismaClient, Role, ProjectStatus, SupplySource, VolumeUnit, ConsumptionMethod } from '@prisma/client';
import bcrypt from 'bcryptjs';
// Import water calculation engine
import engine from '../waterCalculations.js';
import { syncProjectAlerts } from '../src/lib/alert-sync';

const prisma = new PrismaClient();

// Seeded pseudo-random generator for reproducible realistic numbers
function createPrng(seed: number) {
  let s = seed;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return (t >>> 0) / 4294967296;
  };
}

async function main() {
  console.log('🌱 Starting database seed...');

  // 1. Clean existing records in correct relation order
  console.log('🧹 Cleaning previous records...');
  await prisma.auditLog.deleteMany();
  await prisma.alert.deleteMany();
  await prisma.consumptionRecord.deleteMany();
  await prisma.waterSupply.deleteMany();
  await prisma.projectMember.deleteMany();
  await prisma.activityType.deleteMany();
  await prisma.project.deleteMany();
  await prisma.user.deleteMany();

  // 2. Hash default demo password
  const demoPassword = 'Password@123';
  const salt = bcrypt.genSaltSync(10);
  const passwordHash = bcrypt.hashSync(demoPassword, salt);

  // 3. Create Users (1 PM, 2 Site Engineers, 1 Auditor)
  console.log('👤 Creating users...');
  const pm = await prisma.user.create({
    data: {
      name: 'Vikram Malhotra',
      email: 'pm.vikram@watermgmt.io',
      passwordHash,
      role: Role.PROJECT_MANAGER,
      active: true,
    },
  });

  const eng1 = await prisma.user.create({
    data: {
      name: 'Rahul Sharma',
      email: 'engineer.rahul@watermgmt.io',
      passwordHash,
      role: Role.SITE_ENGINEER,
      active: true,
    },
  });

  const eng2 = await prisma.user.create({
    data: {
      name: 'Priya Patel',
      email: 'engineer.priya@watermgmt.io',
      passwordHash,
      role: Role.SITE_ENGINEER,
      active: true,
    },
  });

  const auditor = await prisma.user.create({
    data: {
      name: 'Ananya Iyer',
      email: 'auditor.ananya@watermgmt.io',
      passwordHash,
      role: Role.AUDITOR,
      active: true,
    },
  });

  // 4. Create Global Default Activity Types
  console.log('🏷️ Creating global activity types...');
  const defaultActivities = [
    { name: 'Concrete mixing', color: '#EA580C' },
    { name: 'Curing', color: '#2563EB' },
    { name: 'Plastering', color: '#7C3AED' },
    { name: 'Equipment washing', color: '#0D9488' },
    { name: 'Dust suppression', color: '#D97706' },
    { name: 'Masonry', color: '#B45309' },
    { name: 'Sanitation', color: '#059669' },
    { name: 'Other', color: '#64748B' },
  ];

  const activityTypeMap: Record<string, string> = {};
  for (const act of defaultActivities) {
    const created = await prisma.activityType.create({
      data: {
        projectId: null,
        name: act.name,
        color: act.color,
        active: true,
      },
    });
    activityTypeMap[act.name] = created.id;
  }

  // 5. Create 2 Projects
  console.log('🏗️ Creating projects...');
  const sixtyDaysAgo = new Date();
  sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
  sixtyDaysAgo.setHours(0, 0, 0, 0);

  const project1 = await prisma.project.create({
    data: {
      name: 'Apex Heights Commercial Complex',
      location: 'Sector 62, Gurgaon, NCR',
      clientName: 'Apex Infrastructure Group',
      startDate: sixtyDaysAgo,
      status: ProjectStatus.ACTIVE,
      unaccountedThresholdPercent: 15.0,
      assumedVelocityInPerSec: 47.24,
    },
  });

  const project2 = await prisma.project.create({
    data: {
      name: 'Green Valley High-Rise Residency',
      location: 'Whitefield, Bengaluru, Karnataka',
      clientName: 'Green Valley Developers Ltd',
      startDate: sixtyDaysAgo,
      status: ProjectStatus.ACTIVE,
      unaccountedThresholdPercent: 12.0,
      assumedVelocityInPerSec: 47.24,
    },
  });

  // 6. Assign Project Members
  console.log('🤝 Assigning project members...');
  // Project 1 members: PM, Rahul (Site Engineer), Ananya (Auditor)
  await prisma.projectMember.createMany({
    data: [
      { projectId: project1.id, userId: pm.id },
      { projectId: project1.id, userId: eng1.id },
      { projectId: project1.id, userId: auditor.id },
      // Project 2 members: PM, Priya (Site Engineer), Ananya (Auditor)
      { projectId: project2.id, userId: pm.id },
      { projectId: project2.id, userId: eng2.id },
      { projectId: project2.id, userId: auditor.id },
    ],
  });

  // 7. Generate ~60 Days of Realistic Data per Project
  console.log('💧 Generating ~60 days of water supplies and engine-calculated consumption records...');

  const projectsToSeed = [
    {
      project: project1,
      engineer: eng1,
      seedOffset: 101,
      spikeDay: 24, // Concrete pour spike
      deficitDay: 42, // Tanker breakdown deficit day
      tankerPrefix: 'TKR-APEX',
      zones: ['Tower A - Core', 'Basement B2', 'Batching Plant 1', 'Podium Deck', 'Zone 2 Retaining Wall', 'Site Entrance Road'],
    },
    {
      project: project2,
      engineer: eng2,
      seedOffset: 202,
      spikeDay: 45, // Hydro-wash & inspection spike
      deficitDay: 19, // Municipal water cut deficit day
      tankerPrefix: 'TKR-GV',
      zones: ['Tower 1 - Slab L4', 'Substructure Sump', 'Plastering Yard C', 'Internal Access Road', 'Tower 2 - Column C6', 'Labour Camp & Sanitation'],
    },
  ];

  const tankerSuppliers = [
    'AquaPure Bulk Logistics',
    'Metro Industrial Water Corp',
    'Crystal Springs Water Services',
    'Reliable Tanker Carriers',
  ];

  const activityNames = [
    'Concrete mixing',
    'Curing',
    'Plastering',
    'Equipment washing',
    'Dust suppression',
    'Masonry',
    'Sanitation',
  ];

  for (const cfg of projectsToSeed) {
    const prng = createPrng(cfg.seedOffset);
    console.log(`  ➡️ Seeding 60 days for ${cfg.project.name}...`);

    for (let dayIndex = 0; dayIndex < 60; dayIndex++) {
      const dayDate = new Date(sixtyDaysAgo.getTime() + dayIndex * 24 * 60 * 60 * 1000);
      const isSunday = dayDate.getDay() === 0;

      // -----------------------------------------------------------------
      // A. WATER SUPPLIES (daily tankers 10-30 m3, some days none)
      // -----------------------------------------------------------------
      const isDeficitDay = dayIndex === cfg.deficitDay;
      const isSpikeDay = dayIndex === cfg.spikeDay;

      // On Sundays and ~1 out of every 12 weekdays, no external supply arrives (site uses on-site storage)
      const noSupplyToday = (isSunday && !isSpikeDay) || (dayIndex % 11 === 5 && !isDeficitDay && !isSpikeDay);

      if (!noSupplyToday) {
        if (isDeficitDay) {
          // Anomaly day: Only one small tanker arrived late due to logistical breakdown
          const deliveryTime = new Date(dayDate);
          deliveryTime.setHours(14, 30, 0, 0);

          await prisma.waterSupply.create({
            data: {
              projectId: cfg.project.id,
              date: deliveryTime,
              source: SupplySource.TANKER,
              enteredVolume: 10.0,
              enteredUnit: VolumeUnit.M3,
              volumeM3: 10.0,
              supplier: tankerSuppliers[0],
              referenceNo: `${cfg.tankerPrefix}-D${String(dayIndex + 1).padStart(2, '0')}-01`,
              notes: 'Delivery delayed due to arterial road blockade; partial single load delivered. Stored water drawn to cover daily deficit.',
              createdById: cfg.engineer.id,
            },
          });
        } else {
          // Regular day supplies: 10-30 m3 total
          // Decide whether 1 or 2 deliveries occur today
          const deliveryCount = prng() > 0.45 ? 2 : 1;
          let remainingTarget = 12 + prng() * 16; // 12 to 28 m3

          if (isSpikeDay) {
            remainingTarget = 30.0; // Max regular delivery on spike day
          }

          for (let d = 0; d < deliveryCount; d++) {
            const deliveryTime = new Date(dayDate);
            deliveryTime.setHours(7 + d * 4, Math.floor(prng() * 50), 0, 0);

            const thisLoadM3 = Math.round((remainingTarget / (deliveryCount - d) + (prng() * 3 - 1.5)) * 10) / 10;
            remainingTarget -= thisLoadM3;

            // Occasionally enter in Litres (e.g. 12,000 L) for realistic enteredUnit testing
            const useLitres = prng() < 0.25;
            const enteredUnit = useLitres ? VolumeUnit.L : VolumeUnit.M3;
            const enteredVolume = useLitres ? Math.round(thisLoadM3 * 1000) : thisLoadM3;
            const actualVolumeM3 = useLitres ? enteredVolume / 1000 : enteredVolume;

            const supplier = tankerSuppliers[Math.floor(prng() * tankerSuppliers.length)];
            const source = prng() < 0.85 ? SupplySource.TANKER : (prng() < 0.5 ? SupplySource.BOREWELL : SupplySource.MUNICIPAL);

            await prisma.waterSupply.create({
              data: {
                projectId: cfg.project.id,
                date: deliveryTime,
                source,
                enteredVolume,
                enteredUnit,
                volumeM3: actualVolumeM3,
                supplier,
                referenceNo: `${cfg.tankerPrefix}-D${String(dayIndex + 1).padStart(2, '0')}-0${d + 1}`,
                notes: source === SupplySource.TANKER ? 'Standard quality water delivery verified on weighbridge.' : 'Direct line intake metered at boundary.',
                createdById: cfg.engineer.id,
              },
            });
          }
        }
      }

      // -----------------------------------------------------------------
      // B. CONSUMPTION RECORDS (3-6 per day across FLOW_METER, PIPE, DIRECT)
      // Generated strictly via waterCalculations engine!
      // -----------------------------------------------------------------
      let recordCount: number;
      if (isSpikeDay) {
        recordCount = 6; // Max records on spike day
      } else if (isSunday) {
        recordCount = 3; // Light maintenance on Sundays
      } else {
        recordCount = 3 + Math.floor(prng() * 4); // 3 to 6 records
      }

      for (let r = 0; r < recordCount; r++) {
        const recordTime = new Date(dayDate);
        recordTime.setHours(8 + Math.floor(r * 1.6), Math.floor(prng() * 55), 0, 0);

        const actName = isSpikeDay && r < 3
          ? (r % 2 === 0 ? 'Concrete mixing' : 'Curing')
          : activityNames[(dayIndex + r) % activityNames.length];
        const activityTypeId = activityTypeMap[actName] || activityTypeMap['Other'];
        const locationZone = cfg.zones[(dayIndex + r) % cfg.zones.length];

        // Rotate through methods: FLOW_METER, PIPE, DIRECT
        // Ensure healthy representation of all three methods
        const methodRoll = (dayIndex + r) % 3;

        if (methodRoll === 0) {
          // -------------------------------------------------------------
          // Method 1: FLOW_METER
          // -------------------------------------------------------------
          // Natural variation or spike day boost
          const multiplier = isSpikeDay ? 2.8 : 1.0;
          const rateUnitRoll = prng();
          let flowRate: number;
          let flowRateUnit: 'm3/h' | 'L/s' | 'L/min';
          let time: number;
          let timeUnit: 'min' | 'h';

          if (rateUnitRoll < 0.5) {
            flowRateUnit = 'm3/h';
            flowRate = Math.round((4.0 + prng() * 5.0) * multiplier * 10) / 10;
            timeUnit = 'min';
            time = Math.round(30 + prng() * 60);
          } else if (rateUnitRoll < 0.8) {
            flowRateUnit = 'L/s';
            flowRate = Math.round((1.2 + prng() * 1.8) * multiplier * 100) / 100;
            timeUnit = 'min';
            time = Math.round(20 + prng() * 45);
          } else {
            flowRateUnit = 'L/min';
            flowRate = Math.round((70 + prng() * 90) * multiplier);
            timeUnit = 'h';
            time = Math.round((0.8 + prng() * 1.5) * 10) / 10;
          }

          const inputs = { flowRate, flowRateUnit, time, timeUnit };
          // Call the engine!
          const result = engine.calculateFlowMeterVolume(inputs);

          if (!result.valid) {
            throw new Error(`Engine validation failed for flow meter: ${JSON.stringify(result.errors)}`);
          }

          await prisma.consumptionRecord.create({
            data: {
              projectId: cfg.project.id,
              date: recordTime,
              activityTypeId,
              method: ConsumptionMethod.FLOW_METER,
              inputsJson: JSON.stringify(inputs),
              volumeM3: result.values.volumeM3,
              usedAssumedVelocity: false,
              warningsJson: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
              locationOrZone: locationZone,
              notes: isSpikeDay ? 'High capacity continuous pump metered for mass raft pour.' : 'Flow meter reading verified.',
              createdById: cfg.engineer.id,
            },
          });
        } else if (methodRoll === 1) {
          // -------------------------------------------------------------
          // Method 2: PIPE
          // -------------------------------------------------------------
          // Realistic pipe diameters: 1.0, 1.5, 2.0, 2.5, 3.0 inches
          const diameters = [1.0, 1.5, 2.0, 2.5];
          const diameterInches = diameters[Math.floor(prng() * diameters.length)];
          const timeSeconds = Math.round(1200 + prng() * 3600); // 20 to 80 mins

          // Several pipe records MUST use the assumed default velocity (omit velocityInPerSec)
          // We trigger assumed default when (dayIndex + r) % 5 === 0
          const useAssumed = (dayIndex + r) % 5 === 0;

          let inputs: { diameterInches: number; velocityInPerSec?: number; timeSeconds: number };
          if (useAssumed) {
            // Omitting velocityInPerSec triggers the assumed default velocity in engine!
            inputs = { diameterInches, timeSeconds };
          } else {
            // Explicit measured velocity
            const velocityInPerSec = Math.round((38.0 + prng() * 22.0) * 100) / 100;
            inputs = { diameterInches, velocityInPerSec, timeSeconds };
          }

          // Call the engine!
          const result = engine.calculatePipeVolume(inputs, {
            assumedVelocityInPerSec: cfg.project.assumedVelocityInPerSec,
          });

          if (!result.valid) {
            throw new Error(`Engine validation failed for pipe: ${JSON.stringify(result.errors)}`);
          }

          await prisma.consumptionRecord.create({
            data: {
              projectId: cfg.project.id,
              date: recordTime,
              activityTypeId,
              method: ConsumptionMethod.PIPE,
              inputsJson: JSON.stringify(inputs),
              volumeM3: result.values.volumeM3,
              usedAssumedVelocity: useAssumed,
              warningsJson: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
              locationOrZone: locationZone,
              notes: useAssumed
                ? 'Pipe discharge measured by time; velocity assumed from design default (no pitot tube available).'
                : 'Direct pipe flow measured with in-line Doppler velocity meter.',
              createdById: cfg.engineer.id,
            },
          });
        } else {
          // -------------------------------------------------------------
          // Method 3: DIRECT
          // -------------------------------------------------------------
          const isAnomalyDeficitDay = isDeficitDay && r === 0;
          // Normal direct volume: 1,500 L to 6,000 L (1.5 to 6.0 m3)
          // If on deficit day, ensure the combined consumption slightly exceeds supply (10 m3)
          const baseLitres = isAnomalyDeficitDay
            ? 5200
            : (isSpikeDay ? 7500 : Math.round(1500 + prng() * 3500));

          const inputs = { volumeLitres: baseLitres };
          // Call the engine!
          const result = engine.calculateDirectVolume(inputs);

          if (!result.valid) {
            throw new Error(`Engine validation failed for direct: ${JSON.stringify(result.errors)}`);
          }

          await prisma.consumptionRecord.create({
            data: {
              projectId: cfg.project.id,
              date: recordTime,
              activityTypeId,
              method: ConsumptionMethod.DIRECT,
              inputsJson: JSON.stringify(inputs),
              volumeM3: result.values.volumeM3,
              usedAssumedVelocity: false,
              warningsJson: result.warnings.length > 0 ? JSON.stringify(result.warnings) : null,
              locationOrZone: locationZone,
              notes: 'Batch tank dipstick measurement recorded prior to shift start.',
              createdById: cfg.engineer.id,
            },
          });
        }
      }
    }
  }

  // 8. Seed Realistic Audit Logs
  console.log('📝 Seeding audit logs...');
  await prisma.auditLog.createMany({
    data: [
      {
        userId: pm.id,
        action: 'PROJECT_CREATED',
        entity: 'Project',
        entityId: project1.id,
        beforeJson: null,
        afterJson: JSON.stringify({ name: project1.name, location: project1.location, status: project1.status }),
        createdAt: sixtyDaysAgo,
      },
      {
        userId: pm.id,
        action: 'PROJECT_CREATED',
        entity: 'Project',
        entityId: project2.id,
        beforeJson: null,
        afterJson: JSON.stringify({ name: project2.name, location: project2.location, status: project2.status }),
        createdAt: sixtyDaysAgo,
      },
      {
        userId: pm.id,
        action: 'UPDATE_THRESHOLD',
        entity: 'Project',
        entityId: project1.id,
        beforeJson: JSON.stringify({ unaccountedThresholdPercent: 20.0 }),
        afterJson: JSON.stringify({ unaccountedThresholdPercent: 15.0 }),
        createdAt: new Date(sixtyDaysAgo.getTime() + 10 * 24 * 60 * 60 * 1000),
      },
      {
        userId: eng1.id,
        action: 'LOG_ANOMALY_OVERRIDE',
        entity: 'ConsumptionRecord',
        entityId: 'SpikeDay-24',
        beforeJson: null,
        afterJson: JSON.stringify({
          day: 24,
          reason: 'Mass concrete pour raft slab; consumption spiked above 40 m3 with prior PM authorization.',
        }),
        createdAt: new Date(sixtyDaysAgo.getTime() + 25 * 24 * 60 * 60 * 1000),
      },
      {
        userId: auditor.id,
        action: 'AUDIT_REVIEW_MONTH_1',
        entity: 'WaterBalance',
        entityId: project1.id,
        beforeJson: null,
        afterJson: JSON.stringify({ status: 'FLAGGED_DEFICIT_DAY', reviewedDays: 30, verifiedSupplies: true }),
        createdAt: new Date(sixtyDaysAgo.getTime() + 31 * 24 * 60 * 60 * 1000),
      },
      {
        userId: auditor.id,
        action: 'AUDIT_REVIEW_MONTH_1',
        entity: 'WaterBalance',
        entityId: project2.id,
        beforeJson: null,
        afterJson: JSON.stringify({ status: 'APPROVED_WITH_NOTES', reviewedDays: 30, verifiedSupplies: true }),
        createdAt: new Date(sixtyDaysAgo.getTime() + 31 * 24 * 60 * 60 * 1000),
      },
    ],
  });

  // Verify counts
  const userCount = await prisma.user.count();
  const projectCount = await prisma.project.count();
  const actCount = await prisma.activityType.count();
  const supplyCount = await prisma.waterSupply.count();
  const consumptionCount = await prisma.consumptionRecord.count();
  const assumedCount = await prisma.consumptionRecord.count({ where: { usedAssumedVelocity: true } });
  const auditCount = await prisma.auditLog.count();

  console.log('🚨 Synchronizing anomaly alerts for projects...');
  await syncProjectAlerts(project1.id);
  await syncProjectAlerts(project2.id);
  const alertCount = await prisma.alert.count();

  console.log('\n✅ Database seeding completed successfully!');
  console.log(`📊 Summary of generated records:`);
  console.log(`   - Users: ${userCount} (1 PM, 2 Site Engineers, 1 Auditor)`);
  console.log(`   - Projects: ${projectCount}`);
  console.log(`   - Global Activity Types: ${actCount}`);
  console.log(`   - Water Supplies: ${supplyCount} deliveries across ~60 days`);
  console.log(`   - Consumption Records: ${consumptionCount} records`);
  console.log(`     * Records using assumed default velocity: ${assumedCount}`);
  console.log(`   - Anomaly Alerts Detected: ${alertCount}`);
  console.log(`   - Audit Logs: ${auditCount}`);
}

main()
  .catch((e) => {
    console.error('❌ Error during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

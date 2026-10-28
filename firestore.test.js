const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} = require("@firebase/rules-unit-testing");
const { test, before, after, beforeEach } = require("node:test");
const fs = require("node:fs");

let testEnv;
const PROJECT_ID = "demo-no-project";
const ALICE_UID = "alice_student_123";
const BOB_UID = "bob_student_456";
const ADMIN_UID = "admin_super_789";

const [emulatorHost, emulatorPortStr] = (process.env.FIRESTORE_EMULATOR_HOST || "127.0.0.1:8085").split(":");
const emulatorPort = parseInt(emulatorPortStr, 10);

before(async () => {
  const rules = fs.readFileSync("./firestore.rules", "utf8");
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules,
      host: emulatorHost,
      port: emulatorPort,
    },
  });
});

after(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (testEnv) {
    await testEnv.clearFirestore();
  }
});

test("Unauthenticated user: cannot read rooms or users", async () => {
  const unauthDb = testEnv.unauthenticatedContext().firestore();
  await assertFails(unauthDb.collection("rooms").get());
  await assertFails(unauthDb.collection("users").doc(ALICE_UID).get());
});

test("Authenticated user: can read rooms", async () => {
  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertSucceeds(aliceDb.collection("rooms").get());
});

test("Student cannot read another student's bill", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("bills").doc("bill_bob_1").set({
      billRef: "BILL-001",
      studentId: BOB_UID,
      studentName: "Bob",
      billType: "Room Fee",
      billingPeriod: "2026-2027",
      totalAmount: 15000,
      amountPaid: 5000,
      balanceAmount: 10000,
      dueDate: "2026-11-30",
      paymentStatus: "Pending",
      remarks: "Term 1",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertFails(aliceDb.collection("bills").doc("bill_bob_1").get());
});

test("Student can read their own bill", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("bills").doc("bill_alice_1").set({
      billRef: "BILL-002",
      studentId: ALICE_UID,
      studentName: "Alice",
      billType: "Mess Fee",
      billingPeriod: "2026-11",
      totalAmount: 4000,
      amountPaid: 0,
      balanceAmount: 4000,
      dueDate: "2026-11-15",
      paymentStatus: "Pending",
      remarks: "November Mess",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const aliceDb = testEnv.authenticatedContext(ALICE_UID).firestore();
  await assertSucceeds(aliceDb.collection("bills").doc("bill_alice_1").get());
});

test("Admin can read all bills", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await context.firestore().collection("users").doc(ADMIN_UID).set({
      email: "admin@hostel.edu",
      name: "Hostel Admin",
      role: "admin",
      createdAt: new Date(),
    });
    await context.firestore().collection("bills").doc("bill_alice_1").set({
      billRef: "BILL-002",
      studentId: ALICE_UID,
      studentName: "Alice",
      billType: "Mess Fee",
      billingPeriod: "2026-11",
      totalAmount: 4000,
      amountPaid: 0,
      balanceAmount: 4000,
      dueDate: "2026-11-15",
      paymentStatus: "Pending",
      remarks: "November Mess",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  const adminDb = testEnv.authenticatedContext(ADMIN_UID).firestore();
  await assertSucceeds(adminDb.collection("bills").doc("bill_alice_1").get());
});

const { buffer } = require("micro");
import * as admin from "firebase-admin";

// Secure a connection to FIREBASE from the backend...
let serviceAccount;
// if (process.env.HOST === "http://localhost:3000") {
//   console.log("TEST: YUP RETRIEVING FROM LOCALHOST ");
//   serviceAccount = require("../../../permissions.json");
// } else {
  console.log("TEST: RETRIEVING FROM CDN");
  serviceAccount = JSON.parse(process.env.G_SERVICE_ACCOUNT_PERMISSIONS);
// }

const app = !admin.apps.length
  ? admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    })
  : admin.app();

// Establish connection to Stripe
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

const endpointSecret = process.env.STRIPE_SIGNING_SECRET;

const fulfillOrder = async (session) => {
  console.log("Fulfilling order", session);

  return app
    .firestore()
    .collection("users")
    .doc(session.metadata.email)
    .collection("orders")
    .doc(session.id)
    .set({
      amount: session.amount_total / 100,
      amount_shipping: session.total_details.amount_shipping / 100,
      images: JSON.parse(session.metadata.images),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
    })
    .then(() => {
      console.log(`SUCCESS: ORDER ${session.id} has been added to the DB`);
    })
    .catch((e) => console.log("THERE WAS AN ERROR IN FIRESTORE FUNC", e));
};

export default async (req, res) => {
  if (req.method === "POST") {
    console.log("Got Post Method!!!");
    const requestBuffer = await buffer(req);
    const payload = requestBuffer.toString();
    const sig = req.headers["stripe-signature"];

    let event;

    // Verify that the EVENT posted came from stripe
    try {
      event = stripe.webhooks.constructEvent(payload, sig, endpointSecret);
    } catch (e) {
      return res.status(400).send(`Webhook error: ${e.message}`);
    }

    console.log("Successfully verified the event");
    // Handle the checkout.session.completed event
    if (event.type === "checkout.session.completed") {
      console.log("Handling the checkout session completed event");
      const session = event.data.object;

      // Fulfill the order..
      return fulfillOrder(session)
        .then(() => res.status(200))
        .catch((err) => res.status(400).send(`Webhook Error: ${err.message}`));
    }
  }
};

export const config = {
  api: {
    bodyParser: false,
    externalResolver: true,
  },
};

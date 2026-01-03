const functions = require("firebase-functions");
const admin = require("firebase-admin");
const moment = require("moment");
admin.initializeApp();
const db = admin.firestore();
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//

exports.dailyCron = functions.https.onRequest((request, response) => {
  // fetch active deals and check expiry date

  db.collection("deals")
    .where("deal_expiry", "<", moment().valueOf())
    .where("is_active", "==", true)
    .get()
    .then(snapshot => {
      snapshot.docs.map(doc => {
        db.collection("deals")
          .doc(doc.id)
          .update({ is_active: false });
        return null;
      });

      return response.send(snapshot.docs.length + " deals Expired");
    })
    .catch(err => {
      console.log(err);
      return response.send(err);
    });
});

exports.testNotification = functions.https.onRequest((req, res) => {
  let payload = {
    notification: {
      title: "Thanks for your Purchase!",
      body: 'Get 30% off your next purchase with "COMEBACK30".'
    },
    // data:{
    //     test: "string...."
    // },
    android: {
      priority: "high",
      notification: {
        title: "Thanks for your Purchase!",
        body: 'Get 30% off your next purchase with "COMEBACK30".',
        icon: "cdeal_notification",
        sound: "notification"
      }
    },
    token: req.query.token //"eMRx7ZuqKS4:APA91bFnXj6IdjlxgevbzutZYnFQouFzkQ_5miZfy9DwdKKUbNc53kxUdLEF-F6f9De1LPcuy6bVj61bJ1UZ-N-9IV2w6E5pO87T5qayaXCMiD9c2pR9EKaNqYDDvUg9G9fuGJEJweaU"
  };

  // Send notification
  admin
    .messaging()
    .send(payload)
    .then(result => res.send("Message sent: " + result))
    .catch(error => {
      console.error("Error sending message:", error);
      res.status(500).send(error.toString());
    });
});

exports.sendRedeemNotification = functions.firestore
  .document("deals/{dealId}")
  .onUpdate((change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();
    let user_ref = null,
      type = "",
      title = newData.deal_name,
      body;

    if (newData.redeem_by) {
      if (
        (oldData.redeem_by &&
          newData.redeem_by.length > oldData.redeem_by.length) ||
        !oldData.redeem_by
      ) {
        user_ref = newData.redeem_by[newData.redeem_by.length - 1];
        body = "Deal has been redeemed successfully!";
        type = "deal_redeem";
      }
    } else if (newData.is_active && !oldData.is_active) {
      user_ref = newData.uid;
      body = "Congrats! Your deal is now active.";
      type = "deal_active";
    }

    if (user_ref) {
      return db
        .doc("/users/" + user_ref)
        .get()
        .then(doc => {
          console.log(doc.data());

          //send redeem notification to customer
          let user_obj = doc.data();

          let payload = {
            notification: {
              title: title,
              body: body
            },

            android: {
              priority: "high",
              notification: {
                title: title,
                body: body,
                icon: "cdeal_notification",
                sound: "notification"
              }
            },
            token: user_obj.fcm_token
          };

          //insert into notifications collection
          _saveNotifications({
            uid: user_obj.email,
            type: type,
            title: title,
            body: body,
            created_at: new Date()
          });

          // Send notification
          return admin.messaging().send(payload);
        })
        .catch(err => {
          console.log(err);
          return err;
        });
    }

    return null;
  });

exports.sendChatNotifications = functions.firestore
  .document("deals/{deal_id}/chat_list/{chat_user}/messages/{msg_id}")
  .onCreate((snap, context) => {
    const msgObj = snap.data();
    console.log("chat_user", context.params.chat_user);
    console.log(msgObj);

   return db.collection("deals")
      .doc(context.params.deal_id)
      .collection("chat_list")
      .doc(context.params.chat_user)
      .get()
      .then(doc => {
        let chat = doc.data();
        console.log("chat",chat);
        return db
          .collection("deals")
          .doc(context.params.deal_id)
          .get()
          .then(dealObj => {
            const deal = dealObj.data();

            if (msgObj.uid === context.params.chat_user) {
              //check if seller is online

              if (!chat.is_seller_online) {

                return db
                  .collection("users")
                  .doc(deal.uid)
                  .get()
                  .then(sellerObj => {
                      const seller=sellerObj.data();
                    let payload = {
                      notification: {
                        title: seller.displayName,
                        body: msgObj.text
                      },

                      android: {
                        priority: "high",
                        notification: {
                          title: seller.displayName,
                          body: msgObj.text,
                          icon: "cdeal_notification",
                          sound: "notification"
                        }
                      },
                      token: seller.fcm_token
                    };

                    console.log("seller offline",payload);


                    // Send notification
                    if (payload.token) return admin.messaging().send(payload);
                    else return null;
                  })
                  .catch(err => {
                    console.log("Seller chat error", err);
                  });
              } else return null;
            } else {
              //check if user is online
              if (!chat.is_user_online) {
            console.log("user offline");

                return db
                  .collection("users")
                  .doc(msgObj.uid)
                  .get()
                  .then(userObj => {
                    let user=userObj.data();
                    let payload = {
                      notification: {
                        title: user.displayName,
                        body: msgObj.text
                      },

                      android: {
                        priority: "high",
                        notification: {
                          title: user.displayName,
                          body: msgObj.text,
                          icon: "cdeal_notification",
                          sound: "notification"
                        }
                      },
                      token: user.fcm_token
                    };

                  

                    // Send notification
                    if (payload.token) return admin.messaging().send(payload);
                    else return null;
                  })
                  .catch(err => console.log("User Chat error", err));
              } else return null;
            }
          })
          .catch(err => console.log("deal error", err));
      })
      .catch(err => console.log(" Chat doc error", err));
  });

function _saveNotifications(dataObj) {
  return db.collection("notifications").add(dataObj);
}

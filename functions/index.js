const functions = require("firebase-functions");
const admin = require("firebase-admin");
const moment = require("moment");

// Setup admin app
admin.initializeApp(functions.config().firebase);

// Setup firestore
const firestore = admin.firestore();
const settings = {
  timestampsInSnapshots: true
};
firestore.settings(settings);

// Enum
const stateEnum = {
  doing: 0,
  done: 1,
  failed: 2,
  notToday: 3
};

const repetationEnum = {
  everyDay: "Every day",
  dayOfWeek: "Day of Week",
  period: "Period"
};

const invitationStatusEnum = {
  beInvited: "beInvited",
  accepted: "accepted"
};

const dayOfWeekEnum = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday"
};

const dayOfWeekRefs = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday"
];

// Cron function
exports.minute_job = functions.pubsub
  .topic("minute-tick")
  .onPublish(message => {
    updateHabit();
    updateGoal();
    return true;
  });

exports.day_job = functions.pubsub.topic("day-tick").onPublish(message => {
  countTask();
  return true;
});

exports.get_compact_user_info = functions.https.onRequest((req, res) => {
  let users = {
    users: []
  };

  let infoPromise = [];

  firestore.getCollections().then(collectionRefs => {
    collectionRefs.forEach(collectionRef => {
      if (collectionRef.id == "coops") return;
      console.log(`>>>>>>> ${collectionRef.id}`);
      let query = firestore.collection(collectionRef.id).doc("info");
      let promise = query.get().then(documentSnapshot => {
        let data = documentSnapshot.data();
        if (data != undefined) {
          let user = {
            uid: data.uid,
            photoUrl: data.photoUrl,
            displayName: data.displayName
          };
          users.users.push(user);
        }
      });
      infoPromise.push(promise);
    });

    Promise.all(infoPromise).then(() => {
      res.status(200).send(JSON.stringify(users));
    });
  });
});

exports.invite_participants = functions.https.onRequest((req, res) => {
  let reqBody = req.body;

  let inviter = undefined;
  let coop = undefined;
  let inviteds = [];

  let promises = [];
  let inviterInfoPromise = firestore
    .collection(reqBody.inviterUid)
    .doc("info")
    .get()
    .then(documentSnapshot => {
      inviter = documentSnapshot.data();
    });
  promises.push(inviterInfoPromise);
  let coopInfoPromise = firestore
    .collection("coops")
    .doc(reqBody.coopId)
    .get()
    .then(documentSnapshot => {
      coop = documentSnapshot.data();
    });
  promises.push(coopInfoPromise);
  reqBody.invitedUids.forEach(uid => {
    let query = firestore.collection(uid).doc("info");
    let promise = query.get().then(documentSnapshot => {
      inviteds.push(documentSnapshot.data());
    });
    promises.push(promise);
  });

  Promise.all(promises).then(() => {
    inviteds.forEach(user => {
      user.fcmToken.forEach(token => {
        const notifiedMessage = {
          notification: {
            title: "Invitation",
            body: `You are invited to attain goal "${coop.title}" with "${
              inviter.displayName
            }. Do you accept?"`
          },
          data: {
            category: "Coop",
            status: invitationStatusEnum.beInvited,
            coopId: reqBody.coopId,
            inviterUid: reqBody.inviterUid
          },
          token: token,
          android: {
            notification: {
              click_action: "FLUTTER_NOTIFICATION_CLICK"
            }
          },
          apns: {
            headers: {
              'apns-priority': '10'
            }
          }
        };
        admin
          .messaging()
          .send(notifiedMessage)
          .then(response => {
            console.log("Successfully sent message: ", response);
          })
          .catch(error => {
            console.log("Error sending message: ", error);
          });
      });
    });

    res.status(200).send('Done');
  });
});

// Check if the task must be done today
function isDeadlineToday(data, dataCurrentDate, currentDate) {
  if (dataCurrentDate.isSame(currentDate)) {
    return true;
  }

  const dataRepetationType = data.repetationType;
  switch (dataRepetationType) {
    case repetationEnum.everyDay:
      return true;
    case repetationEnum.period:
      let period = data.period;
      dataCurrentDate = dataCurrentDate.add(period, "days");
      if (dataCurrentDate.isSame(currentDate)) {
        return true;
      } else {
        return false;
      }
    case repetationEnum.dayOfWeek:
      let days = data.daysOfWeek;
      if (days.indexOf(dayOfWeekRefs[currentDate.day()]) != -1) {
        return true;
      } else {
        return false;
      }
    default:
      return false;
  }
}

function updateHabit() {
  const currentDateTime = moment();
  const currentDate = moment();
  currentDate.hour(0);
  currentDate.minute(0);
  currentDate.second(0);
  currentDate.millisecond(0);
  firestore
    .getCollections()
    .then(collectionRefs => {
      collectionRefs.forEach(collectionRef => {
        if (collectionRef.id == "coops") return;
        let tokens = {};
        let infoQuery = firestore.collection(collectionRef.id).doc("info");
        let infoPromise = infoQuery.get().then(documentSnapshot => {
          const infoData = documentSnapshot.data();
          tokens = infoData.fcmToken;
        });

        Promise.all([infoPromise]).then(() => {
          let query = firestore
            .collection(collectionRef.id)
            .doc("habits")
            .collection("habits");
          query
            .get()
            .then(querySnapshot => {
              let docs = querySnapshot.docs;
              for (let doc of docs) {
                // Get data
                const data = doc.data();
                // TODO: Fix due time
                let currentDueTime = moment(data.dueTime);
                currentDueTime.date(currentDate.date());
                currentDueTime.month(currentDate.month());
                currentDueTime.year(currentDate.year());
                let dataDueTime = currentDueTime;
                let dataState = data.state;
                let dataCurrentDate = moment(moment(data.currentDate));
                dataCurrentDate.hour(0);
                dataCurrentDate.minute(0);
                dataCurrentDate.second(0);
                dataCurrentDate.millisecond(0);

                // Update info
                let updateData = {};
                let isNeedUpdate = false;

                // Reset state
                if (!dataDueTime.isSame(moment(data.dueTime))) {
                  updateData.dueTime = dataDueTime.toISOString();
                  // TODO: Is need update state here, peter?????
                  //updateData.state = stateEnum.doing;
                  isNeedUpdate = true;
                }

                if (isDeadlineToday(data, dataCurrentDate, currentDate)) {
                  if (!dataCurrentDate.isSame(currentDate)) {
                    updateData.state = stateEnum.doing;
                    updateData.currentDate = currentDate.toISOString();
                    if (!data.isYesNoTask) {
                      updateData.currentValue = 0;
                    }
                    isNeedUpdate = true;
                  } else {
                    // Check to send notification
                    let timeDiff = dataDueTime.diff(
                      currentDateTime,
                      "minute",
                      true
                    );

                    if (timeDiff > 4 && timeDiff <= 5) {
                      for (let token of tokens) {
                        const notifiedMessage = {
                          notification: {
                            title: "Habit",
                            body: `Your task "${
                              data.title
                            }" is running out of time.`
                          },
                          data: {
                            category: "Habit",
                            documentId: doc.id
                          },
                          token: token,
                          android: {
                            notification: {
                              click_action: "FLUTTER_NOTIFICATION_CLICK"
                            }
                          },
                          apns: {
                            headers: {
                              'apns-priority': '10'
                            }
                          }
                        };
                        admin
                          .messaging()
                          .send(notifiedMessage)
                          .then(response => {
                            console.log(
                              "Successfully sent message: ",
                              response
                            );
                          })
                          .catch(error => {
                            console.log("Error sending message: ", error);
                          });
                      }
                    }

                    // Check fail state
                    if (
                      currentDateTime.isAfter(dataDueTime) &&
                      dataState == stateEnum.doing
                    ) {
                      updateData.state = stateEnum.failed;
                      updateData.isInStreak = false;
                      isNeedUpdate = true;
                    }
                  }
                } else {
                  if (data.state != stateEnum.notToday) {
                    updateData.state = stateEnum.notToday;
                    isNeedUpdate = true;
                  }
                }

                // Trigger update
                if (isNeedUpdate) {
                  console.log(updateData);
                  doc.ref.update(updateData, {
                    merge: true
                  });
                }
              }
              return true;
            })
            .catch(error => {
              console.log(`Error: ${error}`);
            });
        });
      });
      return true;
    })
    .catch(error => {
      console.log(`Error: ${error}`);
    });
}

function updateGoal() {
  const currentDateTime = moment();
  const currentDate = moment();
  currentDate.hour(0);
  currentDate.minute(0);
  currentDate.second(0);
  currentDate.millisecond(0);
  firestore
    .getCollections()
    .then(collectionRefs => {
      collectionRefs.forEach(collectionRef => {
        if (collectionRef.id == "coops") return;
        let tokens = {};
        let infoQuery = firestore.collection(collectionRef.id).doc("info");
        let infoPromise = infoQuery.get().then(documentSnapshot => {
          const infoData = documentSnapshot.data();
          tokens = infoData.fcmToken;
        });

        Promise.all([infoPromise]).then(() => {
          let query = firestore
            .collection(collectionRef.id)
            .doc("goals")
            .collection("goals");
          query
            .get()
            .then(querySnapshot => {
              let docs = querySnapshot.docs;
              for (let doc of docs) {
                const goal = doc.data();
                const goalTargetDate = moment(moment(goal.targetDate));
                goalTargetDate.hour(0);
                goalTargetDate.minute(0);
                goalTargetDate.second(0);
                goalTargetDate.millisecond(0);
                const goalState = goal.state;

                // Update info
                let updateData = {};
                let isNeedUpdate = false;

                // Check to send notification
                let timeDiff = goalTargetDate.diff(
                  currentDateTime,
                  "minute",
                  true
                );
                if (timeDiff > 1440 && timeDiff <= 1441) {
                  for (let token of tokens) {
                    const notifiedMessage = {
                      notification: {
                        title: "Goal",
                        body: `Your goal "${
                          data.title
                        }" is running out of time.`
                      },
                      data: {
                        category: "Goal",
                        documentId: doc.id
                      },
                      token: token,
                      android: {
                        notification: {
                          click_action: "FLUTTER_NOTIFICATION_CLICK"
                        }
                      },
                      apns: {
                        headers: {
                          'apns-priority': '10'
                        }
                      }
                    };
                    admin
                      .messaging()
                      .send(notifiedMessage)
                      .then(response => {
                        console.log("Successfully sent message: ", response);
                      })
                      .catch(error => {
                        console.log("Error sending message: ", error);
                      });
                  }
                }

                if (currentDate.isAfter(goalTargetDate)) {
                  if (goalState == stateEnum.doing) {
                    updateData.state = stateEnum.failed;
                    isNeedUpdate = true;
                  }
                } else {
                  let milestones = goal.milestones;

                  for (let milestone of milestones) {
                    const milestoneTargetDate = moment(
                      moment(milestone.targetDate)
                    );
                    milestoneTargetDate.hour(0);
                    milestoneTargetDate.minute(0);
                    milestoneTargetDate.second(0);
                    milestoneTargetDate.millisecond(0);
                    const milestoneState = milestone.state;

                    // Check to send notification
                    let timeDiff = goalTargetDate.diff(
                      currentDateTime,
                      "minute",
                      true
                    );

                    if (timeDiff > 1440 && timeDiff <= 1441) {
                      for (let token of tokens) {
                        const notifiedMessage = {
                          notification: {
                            title: "Goal",
                            body: `Your milestone "${
                              milestone.title
                            }" is running out of time.`
                          },
                          data: {
                            category: "Goal",
                            documentId: doc.id
                          },
                          token: token,
                          android: {
                            notification: {
                              click_action: "FLUTTER_NOTIFICATION_CLICK"
                            }
                          },
                          apns: {
                            headers: {
                              'apns-priority': '10'
                            }
                          }
                        };
                        admin
                          .messaging()
                          .send(notifiedMessage)
                          .then(response => {
                            console.log(
                              "Successfully sent message: ",
                              response
                            );
                          })
                          .catch(error => {
                            console.log("Error sending message: ", error);
                          });
                      }
                    }
                    if (
                      currentDate.isAfter(milestoneTargetDate) &&
                      milestoneState == stateEnum.doing
                    ) {
                      milestone.state = stateEnum.failed;
                      isNeedUpdate = true;
                    }
                  }

                  updateData.milestones = milestones;
                }

                if (isNeedUpdate) {
                  console.log(updateData);
                  doc.ref.update(updateData, {
                    merge: true
                  });
                }
              }
              return true;
            })
            .catch(error => {
              console.log(`Error: ${error}`);
            });
        });
      });
      return true;
    })
    .catch(error => {
      console.log(`Error: ${error}`);
    });
}

async function countTask() {
  let habitCount = {
    date: moment().date(),
    attainedCount: 0,
    doingCount: 0,
    failedCount: 0
  };
  let goalCount = {
    date: moment().date(),
    attainedCount: 0,
    doingCount: 0,
    failedCount: 0
  };

  var promises = [];

  firestore
    .getCollections()
    .then(collectionRefs => {
      collectionRefs.forEach(collectionRef => {
        if (collectionRef.id == "coops") return;
        let query = firestore
          .collection(collectionRef.id)
          .doc("habits")
          .collection("habits");
        let habitPromise = query.get().then(querySnapshot => {
          let docs = querySnapshot.docs;
          for (let doc of docs) {
            const data = doc.data();
            switch (data.state) {
              case stateEnum.doing:
                habitCount.doingCount++;
                break;
              case stateEnum.done:
                habitCount.attainedCount++;
                break;
              case stateEnum.failed:
                habitCount.failedCount++;
                break;
              default:
                break;
            }
          }
          isHabitCountDone = true;
        });
        promises.push(habitPromise);

        query = firestore
          .collection(collectionRef.id)
          .doc("goals")
          .collection("goals");
        let goalPromise = query.get().then(querySnapshot => {
          let docs = querySnapshot.docs;
          for (let doc of docs) {
            const data = doc.data();
            switch (data.state) {
              case stateEnum.doing:
                goalCount.doingCount++;
                break;
              case stateEnum.done:
                goalCount.attainedCount++;
                break;
              case stateEnum.failed:
                goalCount.failedCount++;
                break;
              default:
                break;
            }
          }
          isGoalCountDone = true;
        });
        promises.push(goalPromise);

        Promise.all(promises).then(() => {
          firestore
            .collection(collectionRef.id)
            .doc("info")
            .get()
            .then(documentSnapshot => {
              const data = documentSnapshot.data();
              if (data != undefined) {
                let habitCounts = data.habitCounts;
                let goalCounts = data.goalCounts;

                if (habitCounts.length >= 10) {
                  habitCounts.splice(0, 1);
                }
                if (goalCounts.length >= 10) {
                  goalCounts.splice(0, 1);
                }

                habitCounts.push(habitCount);
                goalCounts.push(goalCount);

                documentSnapshot.ref.update(
                  {
                    habitCounts: habitCounts,
                    goalCounts: goalCounts
                  },
                  {
                    merge: true
                  }
                );

                console.log(">>>>>>>>>> Daily tick done <<<<<<<<<<");
              }
            });
        });
      });
    })
    .catch(error => {
      console.log(`Error: ${error}`);
    });
}

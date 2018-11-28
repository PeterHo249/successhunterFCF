const functions = require('firebase-functions');
const admin = require('firebase-admin');
const moment = require('moment-timezone');

// Setup momentjs
moment().format();

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
    everyDay: 'Every day',
    dayOfWeek: 'Day of Week',
    period: 'Period'
}

const dayOfWeekEnum = {
    monday: 'Monday',
    tuesday: 'Tuesday',
    wednesday: 'Wednesday',
    thursday: 'Thursday',
    friday: 'Friday',
    saturday: 'Saturday',
    sunday: 'Sunday'
}

const dayOfWeekRefs = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Cron function
exports.minute_job = functions.pubsub.topic('minute-tick').onPublish((message) => {
    updateHabit();
    updateGoal();
    return true;
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
            dataCurrentDate = dataCurrentDate.add(period, 'days');
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
    const currentDateTime = moment().tz('Asia/Ho_Chi_Minh');
    const currentDate = moment(currentDateTime.format('L'));
    firestore.getCollections().then((collectionRefs) => {
        collectionRefs.forEach((collectionRef) => {
            let query = firestore.collection(collectionRef.id).doc('habits').collection('habits');
            query.get().then(querySnapshot => {
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
                    console.log('Due time:');
                    console.log(dataDueTime.toString());
                    let dataState = data.state;
                    let dataCurrentDate = moment(moment(data.currentDate).format('L'));

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
                            if (currentDateTime.isAfter(dataDueTime) && dataState == stateEnum.doing) {
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
            }).catch((error) => {
                console.log(`Error: ${error}`);
            })
        })
        return true;
    }).catch((error) => {
        console.log(`Error: ${error}`);
    })
}

function updateGoal() {
    const currentDateTime = moment().tz('Aisa/Ho_Chi_Minh');
    const currentDate = moment(currentDateTime.format('L'));
    firestore.getCollections().then((collectionRefs) => {
        collectionRefs.forEach((collectionRef) => {
            let query = firestore.collection(collectionRef.id).doc('goals').collection('goals');
            query.get().then(querySnapshot => {
                let docs = querySnapshot.docs;
                for (let doc of docs) {
                    const goal = doc.data();
                    const goalTargetDate = moment(moment(goal.targetDate).format('L'));
                    const goalState = goal.state;

                    // Update info
                    let updateData = {};
                    let isNeedUpdate = false;

                    if (currentDate.isAfter(goalTargetDate)) {
                        if (goalState == stateEnum.doing) {
                            updateData.state = stateEnum.failed;
                            isNeedUpdate = true;
                        }
                    } else {
                        let milestones = goal.milestones;

                        for (let milestone of milestones) {
                            const milestoneTargetDate = moment(moment(milestone.targetDate).format('L'));
                            const milestoneState = milestone.state;
                            if (currentDate.isAfter(milestoneTargetDate) && milestoneState == stateEnum.doing) {
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
            }).catch((error) => {
                console.log(`Error: ${error}`);
            })
        })
        return true;
    }).catch((error) => {
        console.log(`Error: ${error}`);
    })
}
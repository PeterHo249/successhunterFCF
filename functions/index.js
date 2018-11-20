const functions = require('firebase-functions');
const admin = require('firebase-admin');
const moment = require('moment');

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
    failed: 2
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

// Set date in format DD/MM/yyyy 00:00
function normalizeDate(sourceDate) {
    return new moment(`${sourceDate.date}/${sourceDate.month + 1}/${sourceDate.year}`, 'DD/MM/yyyy');
}

// Set date in format currentDate HH:mm
function normalizeTime(sourceTime) {
    return new moment(`${sourceTime.hour()}:${sourceTime.minute()}`, 'HH:mm');
}

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
            if (dateCurrentDate.isSame(currentDate)) {
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
    const currentDate = normalizeDate(currentDateTime);
    firestore.getCollections().then((collectionRefs) => {
        collectionRefs.forEach((collectionRef) => {
            let query = firestore.collection(collectionRef.id).doc('habits').collection('habits');
            query.get().then(querySnapshot => {
                let docs = querySnapshot.docs;
                for (let doc of docs) {
                    // Get data
                    const data = doc.data();
                    let dataDueTime = normalizeTime(new moment(data.dueTime));

                    let dataState = data.state;
                    let dataStreak = data.streak;
                    let dataCurrentDate = normalizeDate(new moment(data.currentDate));

                    // Update info
                    let updateData = {};
                    let isNeedUpdate = false;

                    // Reset state
                    if (isDeadlineToday(data, dataCurrentDate, currentDate)) {

                    }

                    // Trigger update
                    if (isNeedUpdate) {
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
    firestore.getCollections().then((collectionRefs) => {
        collectionRefs.forEach((collectionRef) => {
            let query = firestore.collection(collectionRef.id).doc('goals').collection('goals');
            query.get().then(querySnapshot => {
                let docs = querySnapshot.docs;
                for (let doc of docs) {
                    //console.log(`this is document in path: ${doc.ref.path} has title ${doc.data().title} due on ${new Date(doc.data().dueTime).toString()}`);
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
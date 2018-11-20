const functions = require('firebase-functions');
const admin = require('firebase-admin');
const moment = require('moment');

// Setup momentjs
moment().format();
const currentDateTime = moment();

// Setup admin app
admin.initializeApp(functions.config().firebase);

// Setup firestore
const firestore = admin.firestore();
const settings = {
    timestampsInSnapshots: true
};
firestore.settings(settings);

exports.minute_job = functions.pubsub.topic('minute-tick').onPublish((message) => {
    updateHabit();
    updateGoal();
    return true;
});

function updateHabit() {
    firestore.getCollections().then((collectionRefs) => {
        collectionRefs.forEach((collectionRef) => {
            let query = firestore.collection(collectionRef.id).doc('habits').collection('habits');
            query.get().then(querySnapshot => {
                let docs = querySnapshot.docs;
                for (let doc of docs) {
                    console.log(`this is document in path: ${doc.ref.path} has title ${doc.data().title} due on ${moment(doc.data().dueTime).toString()}`);
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
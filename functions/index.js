const functions = require('firebase-functions')

const admin = require('firebase-admin')
admin.initializeApp()

const tasks = require('@google-cloud/tasks')

exports.addTasks = functions.https.onCall((data, context) => {
  const client = new tasks.CloudTasksClient()

  const projectId = functions.config().werewolf.id
  const queue = 'night'
  const location = functions.config().werewolf.location

  const parent = client.queuePath(projectId, location, queue)

  const roomId = data.roomId
  const dayLength = data.dayLength
  const url = 'https://' + location + '-' + projectId + '.cloudfunctions.net/atNight?roomId=' + roomId
  
  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url: url,
    },
    scheduleTime: {
      seconds: dayLength * 60 + Date.now() / 1000,
    }, 
  }

  const request = {
    parent: parent,
    task: task,
  }

  return client.createTask(request).then((response) => {
    return response
  })
})

exports.atNight = functions.https.onRequest((req, res) => {
  var db = admin.firestore()
  var roomId = req.query.roomId
  var docRef = db.collection('rooms').doc(roomId)

  return docRef.update({
    isNight: true,
  }).then(() => {
    return { isNight: true }
  })
})

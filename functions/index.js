const functions = require('firebase-functions')

const admin = require('firebase-admin')
admin.initializeApp()

const tasks = require('@google-cloud/tasks')

exports.addNightTask = functions.https.onCall((data, context) => {
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

exports.addDaytimeTask = functions.https.onCall((data, context) => {
  const client = new tasks.CloudTasksClient()

  const projectId = functions.config().werewolf.id
  const queue = 'daytime'
  const location = functions.config().werewolf.location

  const parent = client.queuePath(projectId, location, queue)

  const roomId = data.roomId
  const dayLength = data.dayLength
  const nightLength = data.nightLength
  const url = 'https://' + location + '-' + projectId + '.cloudfunctions.net/inDaytime?roomId=' + roomId
  
  const task = {
    httpRequest: {
      httpMethod: 'POST',
      url: url,
    },
    scheduleTime: {
      seconds: (dayLength + nightLength) * 60 + Date.now() / 1000,
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

  docRef.update({
    isNight: true,
  }).then(() => {
    docRef.collection('messages').add({
      from: 'host',
      timestamp: admin.firestore.Timestamp.now(),
      body: "It's night.",
      gameName: '',
      avatar: '',
    }).then((messageRef) => {
      res.send("It's night.")
    })
  })
})

exports.inDaytime = functions.https.onRequest((req, res) => {
  var db = admin.firestore()
  var roomId = req.query.roomId
  var docRef = db.collection('rooms').doc(roomId)

  var countsVillager = 0
  var countsWerewolf = 0
  var countsVote = {}
  var countsBite = {}
  var compareVote = 0
  var compareBite = 0
  var mostVotedPlayer
  var mostVotedPlayerRole
  var mostBittenPlayer
  var protectedPlayer
  var divinedPlayer
  var promises1 = []
  var promises2 = []
  var hasGameEnded = false

  docRef.collection('players').get()
    .then((querySnapShot) => {
      Promise.all(querySnapShot.docs.map((doc) => {
        if (doc.data().isAlive) {
          var votedPlayer = doc.data().votedPlayer
          var playerRole = doc.data().role

          if (playerRole != 'wolf') {
            countsVillager += 1

            if (playerRole == 'knight') {
              protectedPlayer = doc.data().protectedPlayer
            }

            if (playerRole == 'seer') {
              divinedPlayer = doc.data().divinedPlayer
            }
          } else {
            var bittenPlayer = doc.data().bittenPlayer
            countsWerewolf += 1

            if (bittenPlayer != null) {
              if (countsBite[bittenPlayer] == undefined) {
                countsBite[bittenPlayer] = 1
              } else {
                countsBite[bittenPlayer] = countsBite[bittenPlayer] + 1
              }

              if (countsBite[bittenPlayer] > compareBite) {
                compareBite = countsBite[bittenPlayer]
                mostBittenPlayer = bittenPlayer
              }
            }
          }

          if (votedPlayer != null) {
            if (countsVote[votedPlayer] == undefined) {
              countsVote[votedPlayer] = 1
            } else {
              countsVote[votedPlayer] = countsVote[votedPlayer] + 1
            }

            if (countsVote[votedPlayer] > compareVote) {
              compareVote = countsVote[votedPlayer]
              mostVotedPlayer = votedPlayer
              mostVotedPlayerRole = playerRole
            }
          }
        }
      }))
      .then(() => {
        // Execute the most voted player
        docRef.collection('players').doc(mostVotedPlayer).update({
          isAlive: false,
        })
        .then(() => {
          if (mostVotedPlayerRole != 'wolf') {
            countsVillager -= 1
          } else {
            countsWerewolf -= 1
          }

          if (countsWerewolf > 0) {
            // Kill the most bitten player if the player isn't protected by knight
            if (protectedPlayer != mostBittenPlayer && mostVotedPlayer != mostBittenPlayer && mostBittenPlayer != null) {
              var killMostBittenPlayer = docRef.collection('players').doc(mostBittenPlayer).update({ isAlive: false, })
              promises1.push(killMostBittenPlayer)

              countsVillager -= 1
            }
          } else {
            // End this game
            hasGameEnded = true

            var endGame = 
              docRef.update({ 
                status: 'closed',
                isNight: false, 
              })
            promises1.push(endGame)
          }

          Promise.all(promises1).then(() => {
            if (!hasGameEnded) {
              // Check if the number of villagers are greater than the number of wolves
              // TODO: Add the next day's tasks if the game continues
              if (countsVillager > countsWerewolf) {
                var daytimeComes = docRef.update({ isNight: false, })
                var sendDaytimeMessage = 
                  docRef.collection('messages').add({
                    from: 'host',
                    timestamp: admin.firestore.Timestamp.now(),
                    body: "It's daytime.",
                    gameName: '',
                    avatar: '',
                  })

                promises2.push(daytimeComes)
                promises2.push(sendDaytimeMessage)
              } else {
                // End this game
                hasGameEnded = true
                promises2.push(endGame)
              }              
            }

            Promise.all(promises2).then(() => {
              res.send("It's daytime.")
            })
          })
        })
      })
    })
})
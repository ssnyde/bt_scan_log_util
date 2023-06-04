//Import libraries
var AWS = require("aws-sdk");

async function add_scanner (identityIdFull, scannerThingName) {
  var identityId = identityIdFull.split(':')[1]
  console.log("IdentitiyId: " + identityId);
  var options = {
    region: 'us-east-1'
  }
  var iot = new AWS.Iot(options);
  var dynamodb = new AWS.DynamoDB(options);
  //Check if user settings exists
  var params = {
    Key: {
    "sub_id": {
      S: identityId
      }
    }, 
    TableName: "bt_scan_log_v1_user_settings"
  };
  var userSettingsUpdated = false;
  var scannerThingList;
  var user_settings_get = await dynamodb.getItem(params).promise();
  //check each undefined to avoid keyerror and handle any data structure
  if (user_settings_get['Item'] !== undefined && 
    user_settings_get['Item']['scanners'] !== undefined &&
    user_settings_get['Item']['scanners']['SS'] !== undefined &&
    user_settings_get['Item']['scanners']['SS'].includes(scannerThingName)) {
    console.log("Found scannerThingName in db");
  } else {
    console.log("Did not find scannerThingName in db, creating");
    if (user_settings_get['Item'] === undefined ||
      user_settings_get['Item']['scanners'] === undefined ||
      user_settings_get['Item']['scanners']['SS'] === undefined) {
        user_settings_get = { 'Item': { 'scanners': { 'SS': [scannerThingName]}, 'sub_id': {'S': identityId}}}
    } else {
      //if the data structure looks good, just append to array
      user_settings_get['Item']['scanners']['SS'].push(scannerThingName);
    }
    //use params dictionary from above as starting point
    //key used in getitem, not putitem
    delete params['Key'];
    params['Item'] = user_settings_get['Item'];
    //from example, not sure what it does...
    params['ReturnConsumedCapacity'] = 'TOTAL';
    console.log("params for putItem = ");
    console.log(params);
    user_settings_put = await dynamodb.putItem(params).promise();
    userSettingsUpdated = true;
  }
  scannerThingList = user_settings_get['Item']['scanners']['SS'];
  console.log(scannerThingList);


  //Test to see if policy needs to be created
  var paramsPolicy = {
    policyName: identityId /* required */
  };
  var createPolicy = false;
  try {
    getPolicyResponse = await iot.getPolicy(paramsPolicy).promise();
    console.log('AWS IoT policy found');
    policyVersion = getPolicyResponse['defaultVersionId'];
  }
  catch (e) {
    if (e.name === 'ResourceNotFoundException') {
      createPolicy = true;
      console.log('AWS IoT Policy not found, creating');
    } else {
      throw (e);
    }
  }

  var scannerThingSubscribe = '';
  for (let scannerThing in scannerThingList.slice(0,-1)) {
    scannerThingSubscribe = scannerThingSubscribe + `"arn:aws:iot:us-east-1:089627766064:topicfilter/dt/bt_scan_log_v1/${scannerThingList[scannerThing]}",\n`
  }
  scannerThingSubscribe = scannerThingSubscribe + `"arn:aws:iot:us-east-1:089627766064:topicfilter/dt/bt_scan_log_v1/${scannerThingList[scannerThingList.length-1]}"`
  var scannerThingReceive = '';
  for (let scannerThing in scannerThingList.slice(0,-1)) {
    scannerThingReceive = scannerThingReceive + `"arn:aws:iot:us-east-1:089627766064:topic/dt/bt_scan_log_v1/${scannerThingList[scannerThing]}",\n`
  }
  scannerThingReceive = scannerThingReceive + `"arn:aws:iot:us-east-1:089627766064:topic/dt/bt_scan_log_v1/${scannerThingList[scannerThingList.length-1]}"`
  var policyTemplate = `{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": "iot:Connect",
            "Resource": [
                "arn:aws:iot:us-east-1:089627766064:client/\${iot:ClientId}"
            ]
        },
        {
            "Effect": "Allow",
            "Action": "iot:Subscribe",
            "Resource": [
                ${scannerThingSubscribe}
            ]
        },
        {
          "Effect": "Allow",
          "Action": "iot:Receive",
          "Resource": [
              ${scannerThingReceive}
          ]
        }
    ]
  }`
  paramsPolicy['policyDocument'] = policyTemplate;
  if (createPolicy) {
    console.log("Creating policy: ");
    console.log(policyTemplate);
    createPolicyResponse = await iot.createPolicy(paramsPolicy).promise();
    console.log("createPolicy response:");
    console.log(createPolicyResponse);
  } else if (userSettingsUpdated) {
    //the policy existed, but a new thing was added, so updated policy
    paramsPolicy['setAsDefault'] = true;
    createPolicyVersionResponse = await iot.createPolicyVersion(paramsPolicy).promise();
    console.log("Updated policy");
    console.log(createPolicyVersionResponse);
    var paramsDeletePolicy = {
      policyName: identityId,
      policyVersionId: policyVersion
    };
    deletePolicyVersionResponse = await iot.deletePolicyVersion(paramsDeletePolicy).promise();

  }

  var paramsAttachPolicy = {
    policyName: identityId,
    target: identityIdFull
  };
  attachPolicyResponse = await iot.attachPolicy(paramsAttachPolicy).promise();
  console.log("Attach Policy Response: " + attachPolicyResponse);
}

module.exports = { add_scanner };

//Lambda Parameters
// identity for devtest1 cognito user
//var identityId = 'f65a1daf-c1ec-4aff-9157-c3928cb46dca'
//var identityIdFull = 'us-east-1:f65a1daf-c1ec-4aff-9157-c3928cb46dca'
//var scannerThingName = 'BS12K00000'
//add_scanner(identityIdFull, scannerThingName);
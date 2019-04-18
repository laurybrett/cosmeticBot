/* All the required files are need to be imported*/
require('dotenv').config();
const RtmClient  = require('@slack/client').RtmClient;
const WebClient  = require('@slack/client').WebClient;
const RTM_EVENTS = require('@slack/client').RTM_EVENTS;
const VisualRecognitionV3 = require('watson-developer-cloud/visual-recognition/v3');
const fs = require('fs');
const request = require('request');
const path = require('path');
var Slack_token = process.env.Slack_token;
const rtm = new RtmClient(Slack_token);
const web = new WebClient(Slack_token);

/*Local variables initialisation*/
var username = "" /*for storing the username*/
var ifAlreadyReviewStage = false /*once we move to review stage , this variable is used to set for the review comment*/
var productName = ""  /* this is used for product selection name*/
var memberId_Mapper = {
    "UH9USJTFU": "Guanguan HU",
    "UH9NUKU9Z": "Laury Bretteville",
    "UHQQ9FW6B" : "Zheyun LAI",
    "UHG3ZDSAD" : "Kaushik Muhury"
    }

/* Func - recognize()
    - parameter - image
    - visual_recognition - parameters initialisation for ibm watson
    - params - is to set the classifiers type and local image file from the url
    - Promise - it gives the call back for the ibm watson classify function
*/

function recognize(image) {
    const visual_recognition = new VisualRecognitionV3({
        url: process.env.Api_url,
        version: '2018-03-19',
        iam_apikey: process.env.iam_ApiKey,
    });

    const params = {
        images_file: fs.createReadStream(image),
        classifier_ids: process.env.classifier_id
    };


    return new Promise((resolve, reject) => {
        visual_recognition.classify(params, function(err, res) {
        if (err) {
            console.log("visual_recognition---- error: ",err)
            reject(err);
        } else {
            console.log("visual_recognition---- else :error: ",res)
            resolve(res);
        }
    });
});
}

/* Func - rtm.on()
    - for all the messages inserted in the chat bot comes to this callback and it process various logic
 */


rtm.on(RTM_EVENTS.MESSAGE, (message) => {
    /* - initial check for message text is empty or not
      - user is active user or not*/
    if (!message.text ) { return }
    if (message.user === rtm.activeUserId) { return }
    username = memberId_Mapper[message["user"]]

    const permalink = message.text.replace('<', '').replace('>', '');
    console.log("permalink----->",permalink)

    /* this condition is when we do an image upload*/
    if (permalink.match(/\.(png|gif|jpg|jpeg)$/)) {
        console.log("Inside permanling")
        const filename = "/tmp/" + Math.random().toString(36) + path.extname(permalink);
        var slackResponse = {}
        request({
            uri: permalink
        }).pipe(fs.createWriteStream(filename)).on('close', () => {
            console.log("createWriteStream", filename)
            recognize(filename).then((response) => {
                console.log("recognize", response)
                const [primaryClass, ...secondaryClasses] = response.images[0].classifiers[0].classes;
                console.log(response.images[0].classifiers[0].classes)
                productName = primaryClass['class']
                console.log("productName======>",productName)

                /* when the product is not matching in the ibm classifier*/
                if (productName.match(/^OtherCosmeticProduct/)) {
                    slackResponse = {
                        as_user: true,
                        attachments: [
                            {
                                color: "Red",
                                title: `Sorry, it looks like we didn't list this product into our database. :disappointed: `,
                                text: `You can't leave any review for it. See you next time !`
                            }
                        ]
                    }
                } else {
                    ifAlreadyReviewStage = true
                    slackResponse = {
                        as_user: true,
                        attachments: [
                            {
                                color: "Green",
                                title: `Looks like you posted an image of ${primaryClass['class']} with a score of ${primaryClass['score']} .`,
                                text: `Now you can leave a review :blush:`
                            }
                        ]
                    }
                }
                /* to post the message to slack*/
                web.chat.postMessage(message.channel, '', slackResponse, (err) => {
                    console.log("total crash" ,err);
                    console.log(err);
                });
            })
            .catch((err) => {
                console.log("total crash" ,err);
            console.log(err);
            });
        });
    }
    else {
        /* this code is for normal conversation and review section */
        if (permalink.includes("review") && !ifAlreadyReviewStage) {
            var slackResponse = {}
            console.log("what option he choose----> ", message.text)
            slackResponse = {
                as_user: true,
                attachments: [
                    {
                        color: "#466BB0",
                        title: `Good ! How it works : \n- Upload a picture of your product \n- Leave a review \nYou can upload a picture (png/jpg only).`
                    }
                ]
            }
            ifAlreadyReviewStage = true
        } else if (permalink.match(/Hello|Hi/i) && !ifAlreadyReviewStage) {
            console.log("what option he choose----> ", message.text)
            slackResponse = {
                as_user: true,
                attachments: [
                    {
                        color: "#466BB0",
                        title: `Hi ${username}, Nice to meet you. \n I'm CosmeticBot, the bot that accompanies you throughout your journey !
                      \n What do you want to do ? \nYou can choose your option from below`,
                        actions: [
                            {
                                name: "games_list",
                                type: "select",
                                options: [
                                    {
                                        "text": "Leave a review",
                                        "value": "review"
                                    },
                                    {
                                        "text": "More Info",
                                        "value": "info"
                                    }],
                                "response_url": "https://hooks.slack.com/actions/T012AB0A1/123456789/JpmK0yzoZDeRiqfeduTBYXWQ",
                            }]
                    }
                ]
            }
        }
        else if (ifAlreadyReviewStage){
            if (permalink.match(/Bad|Worst|Horrible/i)) {
                ifAlreadyReviewStage = false
                slackResponse = {
                    as_user: true,
                    attachments: [
                        {
                            color: "Red",
                            title: `Seems didnt like the product. Score of your satisfaction 1 / 5. \nWe will inform the company about your review. Thanks for your feedback!`
                        }
                    ]
                }
            } else if (permalink.match(/Awesome|Good|Superb|Wow|Amaz/i)) {
                ifAlreadyReviewStage = false
                slackResponse = {
                    as_user: true,
                    attachments: [
                        {
                            color: "Green",
                            title: `Seems you like the product. Score of your satisfaction 4 / 5. \nWe will inform the company about your review. Thanks for your feedback!`
                        }
                    ]
                }
            }
        }
        else {
            slackResponse = {
                as_user: true,
                attachments: [
                    {
                        color: "#466BB0",
                        title: `I didnt get you. It would be great if you can start with Hi or Hello`
                    }
                ]
            }
        }
        web.chat.postMessage(message.channel, '', slackResponse, (err,res) => {
            console.log("total crash" ,err);
            console.log(err);
        });
    }
});

rtm.start();
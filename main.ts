//To use this morse code machine
//Use Button A or B to input '.' or '-', wait till you see a diamond sign for letter break
//Use Button A+B to send

// Gesture:
//  Shake : clear keystrokes Buffer
// Buttons:
//  A : add '.' to keystrokes buffer
//  B : add '-' to keystrokes buffer
//  A+B : Send morse code when you are done, clear receiverSN if buffter is empty
//
// Radio package format is CS:message:CR
// Echo example : "CS:A:ED" to send 'A'
// Morse code example: "CS:.-:ED" to send '.-'
// Long message is sent in message trunks
// For example, Helloworld is .... . .-.. .-.. --- .-- --- .-. .-.. -..
//      CS:.... . .-.. .:CR
//      CS:-.. --- .-- -:CR
//      CS:-- .-. .-.. -:CR
//      CS:..:ED
// Example for short message: CS:.-:ED -> for morse code '.-'

//Timer interval to insert morser code breaker 2s
const BUTTON_TIMER_INTERVAL = 2000
//Transmit timeout 3s
const TRANSMIT_TIMER_INTERVAL = 3000
const PACKAGE_HEADER = "CS:"
const LETTER_BREAKER = ' '
const PACKAGE_END = ":CR"
const PACKAGE_GROUP_END = ":ED"
//The maximum string length is 19 characters, EOM included
const MAX_SEND_SIZE = 19-1

//Hardcode the receiver SN if we know it, otherwise, set it to the SN from first
//broadcase message received
//let RECEIVER_SN = 1234567890
let DEFINED_RECEIVER_SN = -1
let receiverSN = DEFINED_RECEIVER_SN
let boardSN = control.deviceSerialNumber()
let keystrokes = ""
//Challenge 1, in transmitting state
let inTransmitting = false
let oldButtonTime = 0
let oldTransmitTime = 0

//Morse code look up table
let morseLUT = [".-", "-...", "-.-.", "-..", ".", "..-.",
            "--.", "....", "..", ".---", "-.-", ".-..",
            "--", "-.", "---", ".--.", "--.-", ".-.",
            "...", "-", "..-", "...-", ".--", "-..-",
            "-.--", "--..", ".----", "..---", "...--", "....-",
            ".....", "-....", "--...", "---..", "----.", "-----"]

//Alphabet table
let alphabetLUT = ["A", "B", "C", "D", "E", "F",
                "G", "H", "I", "J", "K", "L",
                "M", "N", "O", "P", "Q", "R",
                "S", "T", "U", "V", "W", "X",
                "Y", "Z", "1", "2", "3", "4",
                "5", "6", "7", "8", "9", "0"]

//Set Bluetooth radio group
radio.setGroup(1)
radio.setTransmitSerialNumber(true);
//Ready
music.playTone(Note.D, 300)

input.onButtonPressed(Button.A, function () {
    const bit = '.'
    //block user's input while in transmitting mode
    if (!inTransmitting) {
        keystrokes = keystrokes + bit
        //Reset button timer
        oldButtonTime = input.runningTime()        
        basic.showString(bit)
        basic.clearScreen()
    }
})

input.onButtonPressed(Button.B, function () {
    const bit = '-'
    //block user's input while in transmitting mode
    if (!inTransmitting) {
        keystrokes = keystrokes + bit
        //Reset button timer
        oldButtonTime = input.runningTime()
        basic.showString(bit)
        basic.clearScreen()
    }
})

input.onButtonPressed(Button.AB, function () {
    if (!inTransmitting) {
        if (!keystrokes.isEmpty()) {
            if (isValidMorseCode(keystrokes)) {
                //Valid morse code, transmit it
                inTransmitting = true
                oldTransmitTime = input.runningTime()
                Transmitter(keystrokes)
            }
            else {
                //Invalid morse code
                basic.showString("?")
                keystrokes = ""
            }
        }
        else {
            //Clear receiver Serial number
            basic.showIcon(IconNames.Diamond)
            receiverSN = DEFINED_RECEIVER_SN
            basic.clearScreen()             
        }
    }
})

//Gesture.Shake : Clear Morse keystrokes
input.onGesture(Gesture.Shake, function() {
    inTransmitting = false    
    basic.showIcon(IconNames.Square)
    keystrokes = ""
    basic.clearScreen()
})

function onButtonTimer() {
    if (inTransmitting) {
        return
    }
    //Add a breaker to current input buffer if it is not empty and
    //no breaker has been added
    if (!keystrokes.isEmpty()) {
        if (keystrokes.substr(keystrokes.length-1) != LETTER_BREAKER) {
            keystrokes += LETTER_BREAKER
            basic.showIcon(IconNames.Target)
            basic.clearScreen()
        }
    }
}

function onTranmitTimer() {
    if (inTransmitting && !keystrokes.isEmpty()) {
        Transmitter(keystrokes)
    }
}

basic.forever(function () {
    //time since the program started in milli-seconds
    let currentTime = input.runningTime()
    if (oldButtonTime != -1 &&
        (currentTime-oldButtonTime)>=BUTTON_TIMER_INTERVAL) {
        onButtonTimer()
        oldButtonTime = currentTime
    }
    if (oldTransmitTime != -1 &&
        (currentTime-oldTransmitTime)>=TRANSMIT_TIMER_INTERVAL) {
        onTranmitTimer()
        oldTransmitTime = currentTime
    }
})

radio.onReceivedString(function (receivedString) {
    Receiver(receivedString)
})

function Transmitter(morsecode_to_send: string) {
	if (inTransmitting) {
        let packages = buildPackages(morsecode_to_send)
        for (let messageTrunk of packages) {
            radio.sendString(messageTrunk)
        }
        //Yeild 100 ms for confirmation
        basic.pause(100)
    }
}

let assembledMessage = ""
function Receiver (receivedString: string) {    
    //Check package header for signature
    if (receivedString.indexOf(PACKAGE_HEADER) ==-1) {
        //Not this application, ignore it
        return 
    }

    //Decode requested receiver sn from the incoming string
    let senderSN = radio.receivedPacket(RadioPacketProperty.SerialNumber)
    if (receiverSN == -1) {
        //Accept the sn of incoming message sender as registered receiver 
        receiverSN = senderSN
    } else if (receiverSN != senderSN) {
        //This board is not the specified receiver, ignore it
        return
    }

    //Remove package header
    let remainingPackage = receivedString.substr(PACKAGE_HEADER.length, receivedString.length-PACKAGE_HEADER.length)
    let group_end_marker = remainingPackage.substr(remainingPackage.length - 
                                            PACKAGE_GROUP_END.length )
    let package_group_end = false
    if (group_end_marker == PACKAGE_GROUP_END) {
        //End of message group
        package_group_end = true
    }

    receivedString = 
            remainingPackage.substr(0, remainingPackage.length -
                    (package_group_end ? PACKAGE_GROUP_END.length : PACKAGE_END.length ))
    assembledMessage += receivedString
    if (!package_group_end) {
        return
    }

    let isAsciiCode = (assembledMessage.indexOf(".") == -1 && assembledMessage.indexOf("-") == -1)
    if (inTransmitting) {
         if (isAsciiCode) {
            let expectedLetter = Decoder(removeLetterDelimiter(keystrokes))
            if (assembledMessage == expectedLetter) {            
                //Receiver has confirmed, back to input mode
                inTransmitting = false              
                keystrokes = ""
                basic.showIcon(IconNames.Yes)
                music.playTone(Note.C, 100)
                basic.clearScreen()
            }
            else {
                //Received wrong echo character
                basic.showString('?')
            }
            //Get ready for next package group
            assembledMessage =""
            return
        }
        //Challenge 1
        //both parties sending information at the same time
        //Received a morse code, when this board is in transmitting mode
        //Fall-though : echo back
    }
 
    //Echo back while not in transmitting mode
    //If the sender is broadcasting or this board's sn is the specified receiver sn
    if (!isAsciiCode) {
        if (receiverSN == senderSN) {
            echoChar(assembledMessage)
            //Get ready for next package group
            assembledMessage =""
        }
    }
}

function buildPackages(message: string) {
    //Challenge 2
    //Is there a way to make sure that only one person can be the receiver?
    //Answer: will keep the sn from the first received message
    //Only accept future messages from the same sn

    let result: string[] = []
    //Since the maximum size of sendString is 19 characters, break long strings
    //into smaller trunks when necessary
    let trimed_message = removeLetterDelimiter(message)
    let chunks = chunkSubstr(trimed_message)
    for(let chunk of chunks) {
      result.push(PACKAGE_HEADER + chunk + PACKAGE_END)
    }
    //To mark the end of sending group:
    //Replace the end of last trunk with PACKAGE_GROUP_END
    let last_trunk = result[result.length-1]
    last_trunk = last_trunk.substr(0, last_trunk.length - PACKAGE_END.length)
    last_trunk = last_trunk + PACKAGE_GROUP_END
    result[result.length-1] = last_trunk

    return result
}

//Input : morse code
function echoChar(message: string) {
    //Echo back to sender with Ascii characters
    let decoded_string = Decoder(message)
    if (!decoded_string.isEmpty()) {
        let packages = buildPackages(decoded_string)
        for (let messageTrunk of packages) {
            radio.sendString(messageTrunk)
        }
        basic.showString(decoded_string)
        basic.clearScreen()
    }
}

//Remove letter delimiter from the buffer end if there is one
function removeLetterDelimiter(message: string) {
    if (message.substr(message.length-1) == LETTER_BREAKER) {
        message = message.substr(0, message.length-1)
    }
    return message
}

//Input : keystrokes buffer, LETTER_DELIMITER seperated
//Output: False if input buffer is empty or any morse code group is invalid
function isValidMorseCode(keystrokes: string) {
    if (keystrokes.isEmpty())
        return false

    keystrokes = removeLetterDelimiter(keystrokes)
    let morse_groups = keystrokes.split(LETTER_BREAKER)
    for(let morse_group of morse_groups) {
        if (morseLUT.indexOf(morse_group) == -1) {
            return false
        }
    }
    return true
}

//Input: Morse
//Output: Ascii character from lookup table, "" if not valid
function Decoder(keystrokes: string) {
    if (keystrokes.isEmpty())
        return ""
    let result = ""
    keystrokes = removeLetterDelimiter(keystrokes)
    let morse_groups = keystrokes.split(LETTER_BREAKER)
    for(let morse_group of morse_groups) {
        let index = morseLUT.indexOf(morse_group)
        if (index == -1) {
            return ""
        }
        result += alphabetLUT[index]
    }
    return result
}

//Input: string
//Break long string into sized trunks
function chunkSubstr(str: string) {
  let size = MAX_SEND_SIZE - PACKAGE_HEADER.length - PACKAGE_END.length

  if (str.isEmpty())
    return []

  let numChunks = Math.ceil(str.length / size)
  let chunks: string[] = []
  for (let i = 0, o = 0; i < numChunks; ++i, o += size) {
    chunks[i] = str.substr(o, size)
  }
  return chunks
}
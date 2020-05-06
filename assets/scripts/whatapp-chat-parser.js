const WhatsAppChatParser = () => {

    const start =  async (filesInput) => {
        const tempFiles = await readFiles(filesInput);
        const files = {}; 

        for(let file of tempFiles) {
            if(file.file.type != 'text/plain') {
                files[`${file.file.name}`] = {type: file.file.type, data: file.fileContent};
            }
        }

        let messageMap;
        let orderedMessages;
        let users;
        for(let file of tempFiles) {
            if(file.file.type === 'text/plain') {
                const parsedResult = parseMessages(file.fileContent, files);
                messageMap = parsedResult.messageMap;
                orderedMessages = parsedResult.orderedMessages;
                users = parsedResult.users;
            }
        }
    
        return { messageMap, orderedMessages, files, users }
    }

    const readFiles = async(fileInput) => {

        let files = [];

        const readFile = (file) => {
            const fileReader = new FileReader();

            return new Promise((resolve, reject) => {
                fileReader.onerror = () => {
                    fileReader.abort();
                    reject(new DOMException("Problem parsing input file."));
                };

                fileReader.onload = () => {
                    resolve({file, fileContent: fileReader.result});
                };

                if(file.type === 'text/plain') {
                    fileReader.readAsText(file);
                } else {
                    fileReader.readAsDataURL(file); 
                }
                
            });
        }

        for(let i = 0; i < fileInput.files.length; i++) {
            let result = await readFile(fileInput.files[i]);
            files.push(result);
        }

        return files;
    }

    /*
        Message structure
        {
            index: int
            fulltimestamp: long
            user: string
            text: string
            file: string 
            links: []
            hash: string
            rawText: string
        }
    */

    const parseMessages = (messages, files) => {

        const users = [];
        const messageMap = {};
        const orderedMessages = [];

        const messageStartRegex = RegExp('[\[]?([0-9]{2})\/([0-9]{2})\/([0-9]{2,4})\, ([0-9]{2}\:[0-9]{2}(?:\:[0-9]{2})?)\]? (?:- )?([^:]+)\: (.*)');

        const fileRegex = RegExp('(([A-Z]{3}\-[0-9]{8}\-[A-Z]{2}[0-9]{4}\..[^ ]*) \(.*\))');

        const parseMessageBody = (body) => {

            let filename;
            let text = body;

            const fileRegexResult = fileRegex.exec(text);
            if(fileRegexResult != null) {
                const [fullLine, fullFilename, tempFilename] = fileRegexResult;
                if(files[tempFilename] != undefined) {
                    text = text.replace(fullFilename, '');
                    filename = tempFilename;
                }
            }

            const linkRegexResult = text.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g);
            let links = linkRegexResult != null ? linkRegexResult : [];
            
            return filename != undefined ? {text, filename, links} : {text, undefined, links} 
        };

        const parseDateToTimestamp = (day, month, year, time) => {
            const formattedYear = year.length === 2 ? `20${year}` : year;
            return new Date(`${formattedYear}/${month}/${day} ${time}:00`).getTime();
        };

        const parseUser = (name) => {

            let foundUser = false;

            const getRandomColor = () => {
                var letters = '0123456789ABCDEF';
                var color = '#';
                for (var i = 0; i < 6; i++) {
                    color += letters[Math.floor(Math.random() * 16)];
                }
                return color;
            }

            for(let user of users) {
                if(user.name === name) {
                    foundUser = true;
                    break;
                }
            }
            if(foundUser == false)
                users.push({name, color: getRandomColor()});

        }

        const rawMessages = messages.split('\n');

        let currentMessage = null;

        for(let [index, rawMessage] of rawMessages.entries()) {

            const messageStart = messageStartRegex.exec(rawMessage);
            if(messageStart != null) {

                console.log(messageStart);

                const [fullLine, day, month, year, fullTime, username, body] = messageStart;

                if(currentMessage != null) {
                    currentMessage.hash = hashCode(`${index}${currentMessage.fulltimestamp}${currentMessage.username}${currentMessage.rawText}`);
                    messageMap[currentMessage.hash] = {...currentMessage};
                    orderedMessages.push(currentMessage.hash);
                }
                
                currentMessage = {};
                currentMessage.index = index;
                
                currentMessage.fulltimestamp = parseDateToTimestamp(day, month, year, fullTime);

                currentMessage.user = username;
                parseUser(username);

                currentMessage.rawText = body;

                const {text, filename, links} = parseMessageBody(body);
                currentMessage.text = text;
                currentMessage.file = filename != undefined ? filename : '';
                currentMessage.links = links;

            } else {
                if(currentMessage != null) {
                    const {text, filename} = parseMessageBody(rawMessage);
                    currentMessage.text += currentMessage.text === '' ? text : ` ${text}`;
                    if( filename != undefined )
                        currentMessage.files.push(filename);
                }
            }
        
        }

        if(currentMessage != null) {
            currentMessage.hash = hashCode(`${currentMessage.id}${currentMessage.fulltimestamp}${currentMessage.username}${currentMessage.rawText}`);
            messageMap[currentMessage.hash] = {...currentMessage};
            orderedMessages.push(currentMessage.hash);
            currentMessage = null;
        }

        return ({messageMap, orderedMessages, users});

    };

    const hashCode = (s) => {
        let h;
        for(let i = 0; i < s.length; i++) 
              h = Math.imul(31, h) + s.charCodeAt(i) | 0;
    
        return h;
    }
 
    return ({ start });
}

export default WhatsAppChatParser;
import mime from 'mime-types';
import JSZip from 'jszip';

const WhatsAppChatParser = () => {

    /**
     * Starts the parsing of files of a given input
     * @param {Element Node} filesInput Input from which the files are going to be parsed
     * @returns {{Map, Map, object}}
     */
    const start =  async (filesInput) => {

        const tempFiles = await readFiles(filesInput);

        console.log(tempFiles);

        const files = new Map(); 

        for(let {file, file:{name}, file:{type}, fileContent} of tempFiles) {
            if(type != 'text/plain')
                files.set(hashCode(fileContent), { name, type, data: fileContent});
        }

        let messageMap;
        let users;
        for(let file of tempFiles) {
            if(file.file.type === 'text/plain') {
                const parsedResult = parseMessages(file.fileContent, files);
                messageMap = parsedResult.messageMap;
                users = parsedResult.users;
            }
        }   

        console.log(messageMap);

        return { messageMap, files, users }
    }

    const readFiles = async(fileInput) => {

        let files = [];

        const readFile = (file) => {
            const fileReader = new FileReader();

            return new Promise( async(resolve, reject) => {
                fileReader.onerror = () => {
                    fileReader.abort();
                    reject(new DOMException("Problem parsing input file."));
                };

                fileReader.onload = () => {
                    resolve([{file, fileContent: fileReader.result}]);
                };

                if(file.type === 'text/plain') {
                    fileReader.readAsText(file);
                } else if(file.type === 'application/zip') {

                    const jsZip = new JSZip();
                    const zip = await jsZip.loadAsync(file); 
                    const files = Object.keys(zip.files);

                    const result = [];

                    for(const filename of files) {
                        const file = zip.files[filename];
                        if(!file.dir && !filename.includes('__MACOSX/', 0)) {

                            const ext = filename.split('.').pop();
                            const type = mime.lookup(ext);

                            const fileObject = {
                                file: {
                                    name: filename,
                                    size: file._data.uncompressedSize,
                                    type
                                },
                                fileContent: {},
                            };

                            if(type === 'text/plain') {
                                fileObject.fileContent = await file.async('text');
                            } else {
                                var data = await file.async('binarystring');
                                fileObject.fileContent = btoa(data);
                                 
                            }
                            result.push(fileObject);        
                        }
                    }
                    resolve(result);      
                } else {
                    fileReader.readAsDataURL(file); 
                }
                
            });
        }

        for(let i = 0; i < fileInput.length; i++) {
            let result = await readFile(fileInput[i]);
            console.log(result);
            files = files.concat(result);
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
            links: [
                { 
                    url: !!!!!!!!!!!!!!!
                    type:!!!!!!!!!!!!!!!!!!!!!!!
                }
            ]
            hash: string
            rawText: string
            atUser: []
        }
    */

    const parseMessages = (messages, files) => {

        const users = {
            numbers: [],
        };
        const messageMap = new Map();

        const messageStartRegex = RegExp('[\[]?([0-9]{2})\/([0-9]{2})\/([0-9]{2,4})\, ([0-9]{2}\:[0-9]{2}(?:\:[0-9]{2})?)\]? (?:- )?([^:]+)\: (.*)');

        const fileRegex = RegExp('(([A-Z]{3}\-[0-9]{8}\-[A-Z]{2}[0-9]{4}\..[^ ]*) \(.*\))');

        const parseMessageBody = (body) => {

            let filename = [];
            let text = body;

            const fileRegexResult = fileRegex.exec(text);
            if(fileRegexResult != null) {
                const [fullLine, fullFilename, tempFilename] = fileRegexResult;

                let hash;
                files.forEach((value, key) => {
                    if(value.name === tempFilename) hash = key;
                });

                if(hash != undefined) {
                    text = text.replace(fullFilename, '');
                    filename.push(hash);
                }

            }

            const linkRegexResult = text.match(/https?:\/\/(www\.)?[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)/g);
            let links = linkRegexResult != null ? linkRegexResult : [];
            
            //youtube regex
            //(http:|https:)?(\/\/)?(www\.)?(youtube.com|youtu.be|youtube-nocookie.com)\/(watch|embed)?(\?v=|\/)?(\S+)?

            const atRegexresult = text.match(/(@[0-9]+)/g);
            let atUser = atRegexresult != null ? atRegexresult : []

            return {text, filename, links, atUser}
        };

        const parseDateToTimestamp = (day, month, year, time) => {
            const formattedYear = year.length === 2 ? `20${year}` : year;
            const formattedTime = time.length === 5 ? `${time}:00`: time
            return new Date(`${formattedYear}/${month}/${day} ${formattedTime}`).getTime();
        };

        const rawMessages = messages.split('\n');
        console.log(rawMessages);
        let currentMessage = null;

        for(let [index, rawMessage] of rawMessages.entries()) {

            const messageStart = messageStartRegex.exec(rawMessage);
            if(messageStart != null) {

                const [fullLine, day, month, year, fullTime, username, body] = messageStart;

                if(currentMessage != null) 
                    messageMap.set(currentMessage.hash, {...currentMessage});
                
                currentMessage = {};
                currentMessage.index = index;
                currentMessage.hash = hashCode(rawMessage);
                
                currentMessage.fulltimestamp = parseDateToTimestamp(day, month, year, fullTime);

                const hashUser = hashCode(username);
                if(!users.hasOwnProperty(hashUser)) {
                    users[hashUser] = {
                        name: username,
                    }
                }                
                currentMessage.user = hashUser;
                currentMessage.rawText = [body];

                const {text, filename, links, atUser} = parseMessageBody(body);
                currentMessage.text = [text];
                currentMessage.files = filename;
                currentMessage.links = links;
                currentMessage.atUser = atUser;

                for(let number of atUser) {
                    if(!users.numbers.includes(number)) users.numbers.push(number);
                }

            } else {

                if(currentMessage != null) {
                    const {text, filename, links, atUser} = parseMessageBody(rawMessage);
                    if(text != '') 
                        currentMessage.text.push(text);    //currentMessage.text === '' ? text : ` ${text}`;
                    if(rawMessage != '') 
                        currentMessage.rawText.push(rawMessage); //+= `\n${rawMessage}`;
                    currentMessage.files.concat(filename);
                    currentMessage.links = currentMessage.links.concat(links);
                    currentMessage.atUser = currentMessage.atUser.concat(atUser);
                    for(let number of atUser) {
                        if(!users.numbers.includes(number)) users.numbers.push(number);
                    }
                }
                
            }
        
        }

        if(currentMessage != null) {
            messageMap.set(currentMessage.hash, {...currentMessage});
            currentMessage = null;
        }
 
        return ({messageMap, users});

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
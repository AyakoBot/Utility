import type { DescriptiveRawFile } from '@discordjs/core';

/**
 * Returns a Discord attachment payload for a text file.
 * @param array - An array of strings to be written to the file.
 * Used to format the output differently for different sources.
 * @param name - Optional. A string to be used as the filename. Defaults to the current timestamp.
 * @returns A Discord attachment payload object containing the text file.
 */
export default (array: string[] | string, name = String(Date.now())) => {
 let content = '';
 const split = '\n';

 if (Array.isArray(array)) {
  if (!content.length) {
   array.forEach((element) => {
    content += `${element}${split}`;
   });
  }
 } else {
  content = array;
 }

 const buffer = Buffer.from(content, 'utf-8');
 const attachment: DescriptiveRawFile = {
  data: buffer,
  name: `${name.replace('.txt', '')}.txt`,
 };

 return attachment;
};

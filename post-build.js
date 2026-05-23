import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import * as ResEdit from 'resedit';
import svgToIco from 'svg-to-ico';

const { version, name, description, author } = createRequire(import.meta.url)('./package.json');

const exePath = 'build/ios-uploader-win.exe';
const lang = 1033; // en-US
const codepage = 1200; // Unicode

const exeData = fs.readFileSync(exePath);
const exe = ResEdit.NtExecutable.from(exeData);
const res = ResEdit.NtExecutableResource.from(exe);

await svgToIco({ input_name: 'icon.svg', output_name: 'icon.ico' });
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync('icon.ico'));
fs.unlinkSync('icon.ico');

ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  res.entries,
  1,
  lang,
  iconFile.icons.map((item) => item.data),
);

const viList = ResEdit.Resource.VersionInfo.fromEntries(res.entries);
const vi = viList[0];

const [major, minor, patch] = version.split('.');
vi.setFileVersion(Number(major), Number(minor), Number(patch), 0, lang);
vi.setProductVersion(Number(major), Number(minor), Number(patch), 0, lang);

vi.setStringValues(
  { lang, codepage },
  {
    FileDescription: description,
    ProductName: name,
    CompanyName: author,
    ProductVersion: version,
    FileVersion: version,
    OriginalFilename: path.basename(exePath),
    LegalCopyright: `Copyright (c) ${new Date().getFullYear()} ${author}.`,
  },
);

vi.outputToResourceEntries(res.entries);
res.outputResource(exe);
const newBinary = exe.generate();

fs.writeFileSync(exePath, Buffer.from(newBinary));

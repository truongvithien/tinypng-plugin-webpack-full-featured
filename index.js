/* eslint class-methods-use-this: ["error", { "exceptMethods": ["upload", "download"] }] */
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const glob = require("glob");
const tinify = require("tinify");

class TinypngPlugin {
    constructor(options = {}) {
        this.options = {
            useAPI: false,
            extentions: ['png', 'jpg', 'jpeg'],
            silent: false,
            cache: true,
            cacheLocation: path.resolve(__dirname, 'dict'),
            projectRoot: path.resolve(__dirname, '../../'),
            from: path.resolve(__dirname, '../../'),
            disable: false,
            ...options,
        };
        this.log('options: ', options);
        const extentions = this.options.extentions.join('|');
        this.tester = new RegExp(`\\.(${extentions})(\\?.*)?$`);
        this.dict = [];
        this.shouldRewriteDict = false;
    }
    apply(compiler) {
        const onEmit = async (compilation, callback) => {
            if (this.options.from.indexOf(this.options.projectRoot) < 0) {
                throw new Error('From option should be in the project!!!');
                return;
            }
            if (!this.options.disable) {
                // const files = await this.getFilesFromDirectory();
                const files2 = await this.getFilesRecursively(this.options.from);
                // this.log('list file retrieved');
                // this.log(files);
                this.log('list file retrieved (recursively)');
                this.log(files2);
                this.log('start compressing');
                this.getCache();

                if (!this.options.useAPI) {
                    await Promise.all(files2.map(file => this.compressSingleFile(file)));
                } else if (typeof this.options.useAPI === 'string') {

                } else {
                    this.log('useAPI should be false logic or string of type.')
                }
                this.setCache();
                this.log('finished!!');
            }
            callback();
        };

        if (compiler.hooks) {
            // changed hooks emit to afterEmit
            compiler.hooks.afterEmit.tapAsync('onEmit', onEmit);
        } else {
            compiler.plugin('emit', onEmit);
        }
    }

    log(info) {
        if (!this.options.silent) {
            console.log(...arguments);
        }
    }

    getCache() {
        try {
            if (fs.statSync(this.options.cacheLocation).isFile() && this.options.cache) {
                const cache = fs.readFileSync(this.options.cacheLocation);
                this.dict = JSON.parse(cache).map(el => ({
                    ...el,
                    filePath: el.filePath,
                }));
            } else {
                this.dict = [];
            }
        } catch (e) {
            this.dict = [];
        }
    }

    setCache() {
        if (this.options.cache && this.dict.length > 0 && this.shouldRewriteDict) {
            fs.writeFileSync(this.options.cacheLocation, JSON.stringify(this.dict));
        }
    }


    async compressSingleFileWithAPI(filePath, api) {
        tinify.key = api;

        try {
            if (this.tester.test(filePath)) {
                const { size } = fs.statSync(filePath);
                const filePathRelative = filePath.split(this.options.projectRoot)[1];
                if (!this.dict.find(el => el.filePath === filePathRelative && el.size === size)) {
                    this.shouldRewriteDict = true;
                    const { input, output } = await this.upload(filePath);
                    const compressedFile = await this.download(output.url);
                    this.log(
                        `${filePathRelative}: original size <${input.size}B>, compressed size <${
                            output.size
                        }B>, compress ratio <${(output.ratio * 100).toFixed(2)}%>`,
                    );
                    fs.writeFileSync(filePath, compressedFile);
                    // set cache
                    this.dict.push({
                        filePath: filePathRelative,
                        size: output.size,
                    });
                }
            }
        } catch (e) {
            this.log(e);
        }

        const source = tinify.fromFile("unoptimized.jpg");
        source.toFile("optimized.jpg");

        tinify.fromFile("unoptimized.png").toFile("optimized.png");
    }

    async compressSingleFile(filePath) {
        /* {
            input: { size: 1848, type: 'image/png' },
            output: {
                size: 1491,
                type: 'image/png',
                width: 92,
                height: 92,
                ratio: 0.8068,
                url: 'https://tinypng.com/web/output/85ur1eqa69tfxvmwu5eam5k4708831q3',
            },
        } */
        try {
            if (this.tester.test(filePath)) {
                const { size } = fs.statSync(filePath);
                const filePathRelative = filePath.split(this.options.projectRoot)[1];
                if (!this.dict.find(el => el.filePath === filePathRelative && el.size === size)) {
                    this.shouldRewriteDict = true;
                    const { input, output } = await this.upload(filePath);
                    const compressedFile = await this.download(output.url);
                    this.log(
                        `${filePathRelative}: original size <${input.size}B>, compressed size <${
                            output.size
                        }B>, compress ratio <${(output.ratio * 100).toFixed(2)}%>`,
                    );
                    fs.writeFileSync(filePath, compressedFile);
                    // set cache
                    this.dict.push({
                        filePath: filePathRelative,
                        size: output.size,
                    });
                }
            }
        } catch (e) {
            this.log(e);
        }
    }

    async upload(filePath) {
        try {
            const file = fs.readFileSync(filePath);
            const { data } = await axios({
                method: 'post',
                url: 'https://tinypng.com/web/shrink',
                headers: { 'User-Agent': 'QQBrowser' },
                data: file,
            });
            return data;
        } catch (err) {
            if (err.response) {
                const { data } = err.response;
                throw new Error(JSON.stringify(data));
            }
            throw err;
        }
    }

    async download(url) {
        const { data, status } = await axios({ url, responseType: 'arraybuffer' });
        if (status === 200) {
            return data;
        }
        throw new Error(data);
    }

    async getFilesFromDirectory() {
        // TODO: 进行遍历层数的可配置项
        const filteredFiles = [];
        await new Promise(resolve => {
            fs.readdir(this.options.from, async (err, files) => {
                files.forEach(file => {
                    const filename = `${this.options.from}/${file}`;
                    const fileStat = fs.statSync(filename);
                    if (fileStat.isDirectory()) {
                        const subDirFiles = fs.readdirSync(filename);
                        subDirFiles.forEach(subDirFile => {
                            const subDirFileName = `${filename}/${subDirFile}`;
                            const subDirFileStat = fs.statSync(subDirFileName);
                            if (subDirFileStat.isFile()) {
                                filteredFiles.push(subDirFileName);
                            }
                        });
                    } else if (fileStat.isFile()) {
                        filteredFiles.push(filename);
                    }
                });
                resolve();
            });
        });
        return filteredFiles;
    }

    async getFilesRecursively(src) {
        var filteredFiles = [];
        await new Promise(resolve => {
            const getDirectories = function (src, callback) {
                glob(src + '/**/*', callback);
            };
            getDirectories(src, function (err, res) {
                if (err) {
                    console.log('Error', err);
                } else {
                    // console.log(res);
                    // filteredFiles.push(res);
                    filteredFiles = res;
                    resolve();
                }
            });
        });
        return filteredFiles;
    }

}
module.exports = TinypngPlugin;

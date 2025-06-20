// Automatic Denicker
// Adapted from Pug's Denicker Raven script (github.com/PugrillaDev)

const PLUGIN_INFO = {
    name: 'denicker',
    displayName: 'Denicker',
    version: '0.0.3',
    description: 'Detects and resolves nicked players (Inspired by github.com/PugrillaDev)',
    suffix: '§cDN' // [Starfish-DN]
};

module.exports = (proxyAPI) => {
    const denicker = new DenickerSystem(proxyAPI);

    proxyAPI.registerPlugin(PLUGIN_INFO, denicker);

    const buildConfigSchema = () => {
        return schema;
    };
    
    proxyAPI.registerCommands('denicker', (registry) => {
        registry.registerConfig({
            displayName: PLUGIN_INFO.displayName,
            configObject: denicker.config,
            schemaBuilder: buildConfigSchema
        });
    });
    
    return PLUGIN_INFO;
};

const schema = [
    {
        label: 'Show Unresolved Nicks',
        defaults: { showUnresolvedNicks: { enabled: false } },
        settings: [
            {
                type: 'toggle',
                key: 'showUnresolvedNicks.enabled',
                text: ['OFF', 'ON'],
                description: 'If enabled, shows an alert for players who are likely nicked but could not be resolved to a real name.'
            }
        ]
    },
    {
        label: 'Audio Alerts',
        defaults: { audioAlerts: { enabled: true } },
        settings: [
            {
                type: 'toggle',
                key: 'audioAlerts.enabled',
                text: ['OFF', 'ON'],
                description: 'Plays a sound when an alert is triggered.'
            }
        ]
    },
    {
        label: 'Alert Delay',
        defaults: { alertDelay: 1000 },
        settings: [
             {
                type: 'cycle',
                key: 'alertDelay',
                description: 'The delay in milliseconds before sending a denick alert.',
                displayLabel: 'Delay',
                values: [
                    { text: '0ms', value: 0 },
                    { text: '500ms', value: 500 },
                    { text: '1000ms', value: 1000 },
                    { text: '2000ms', value: 2000 }
                ]
            }
        ]
    }
];


class DenickerSystem {
    constructor(proxyAPI) {
        this.proxyAPI = proxyAPI;
        this.PLUGIN_PREFIX = `§8[${this.proxyAPI.proxyPrefix}§8${PLUGIN_INFO.suffix}§8]§r`;
        this.LOG_PREFIX = `[${PLUGIN_INFO.displayName}]`;
        this.DEBUG_PREFIX = `[${PLUGIN_INFO.displayName}-Debug]`;

        this.config = {
            showUnresolvedNicks: { enabled: true },
            audioAlerts: { enabled: true },
            alertDelay: 1000,
        };

        this.parsedPlayers = new Set();
        this.userPosition = null;

        this.nickData = new Map();
        this.teamData = new Map();
        this.playerTeams = new Map();

        this.registerHandlers();
    }

    reset() {
        this.userPosition = null;
        this.nickData.clear();
        this.teamData.clear();
        this.playerTeams.clear();
    }

    onDisable() {
        this.reset();
    }

    onEnable(joinState) {
        this.reset();
        if (joinState && Array.isArray(joinState.teamData)) {
            for (const [team, info] of joinState.teamData) {
                this.teamData.set(team, info);
            }
        }
        if (joinState && Array.isArray(joinState.playerTeams)) {
            for (const [playerName, teamName] of joinState.playerTeams) {
                this.playerTeams.set(playerName, teamName);
            }
        }
    }

    registerHandlers() {
        this.proxyAPI.on('serverPacketMonitor', ({ data, meta }) => {
            if (!this.proxyAPI.isPluginEnabled('denicker')) return;

            if (meta.name === 'player_info') {
                if (data.action === 0) {
                    for (const player of data.data) {
                        if (player.UUID.charAt(14) !== '1') continue;
                        if (player.properties) {
                            this.detectNick(player);
                        }
                    }
                }

            } else if (meta.name === 'scoreboard_team') {
                this.handleScoreboardTeam(data);
            } else if (meta.name === 'respawn') {
                this.reset();
            }
        });

        this.proxyAPI.on('clientPacketMonitor', ({ data, meta }) => {
            if (meta.name === 'position' || meta.name === 'position_look') {
                this.userPosition = { x: data.x, y: data.y, z: data.z };
            }
        });

        this.proxyAPI.on('playerJoin', () => this.reset());
        this.proxyAPI.on('playerLeave', () => this.reset());
    }

    handleScoreboardTeam(data) {
        const { mode, team: teamName, players } = data;

        if (mode === 0 || mode === 2) {
            this.teamData.set(teamName, {
                prefix: data.prefix || '',
                suffix: data.suffix || ''
            });
            for (const [playerName, pTeamName] of this.playerTeams) {
                if (pTeamName === teamName) {
                    this.triggerUpdateForPlayer(playerName);
                }
            }
        }
        
        if (mode === 3 && players) {
            for (const playerName of players) {
                const cleanName = playerName.replace(/§./g, '');
                this.playerTeams.set(cleanName, teamName);
                this.triggerUpdateForPlayer(cleanName);
            }
        }

        if (mode === 4 && players) {
            for (const playerName of players) {
                const cleanName = playerName.replace(/§./g, '');
                this.playerTeams.delete(cleanName);
                this.triggerUpdateForPlayer(cleanName);
            }
        }

        if (mode === 1) {
            this.teamData.delete(teamName);
             for (const [playerName, pTeamName] of this.playerTeams) {
                if (pTeamName === teamName) {
                    this.playerTeams.delete(playerName);
                    this.triggerUpdateForPlayer(playerName);
                }
            }
        }
    }

    triggerUpdateForPlayer(cleanName) { 
        for (const [uuid, nickInfo] of this.nickData) {
            if (nickInfo.name === cleanName) {
                this.tryUpdateNickTab(uuid);
                return;
            }
        }
    }

    detectNick(player) {
        if (this.nickData.has(player.UUID)) return;

        const textureProp = player.properties.find(p => p.name === 'textures');
        if (!textureProp?.value) return;

        try {
            const skinData = JSON.parse(Buffer.from(textureProp.value, 'base64').toString('utf8'));
            const url = skinData.textures?.SKIN?.url;
            if (!url) return;

            const hash = url.split('/').pop();

            if (KNOWN_NICK_SKINS.has(hash)) {
                this.proxyAPI.debugLog(`Detected unresolved nick: ${player.name}`);
                this.storeNickInfo(player, null);
                if (this.config.showUnresolvedNicks.enabled) {
                    this.sendAlert(player.name, null);
                }
                return;
            }

            const realName = skinData.profileName;
            if (realName && realName !== player.name.replace(/§.$/, '')) {
                this.proxyAPI.debugLog(`Resolved nick: ${player.name} -> ${realName}`);
                this.sendAlert(player.name, realName);
                this.storeNickInfo(player, realName);
            }
        } catch (e) {
            this.proxyAPI.log(`Skin parse error for ${player.name}:`, e.message);
        }
    }

    storeNickInfo(player, realName) {
        const cleanName = player.name.replace(/§./g, '');
        
        this.nickData.set(player.UUID, { 
            name: cleanName,
            realName 
        });

        this.tryUpdateNickTab(player.UUID);
    }

    tryUpdateNickTab(uuid) {
        const nickInfo = this.nickData.get(uuid);
        if (!nickInfo) return;

        const teamName = this.playerTeams.get(nickInfo.name);
        const teamInfo = teamName ? this.teamData.get(teamName) : null;

        if (teamName && !teamInfo) {
            return;
        }

        const prefix = teamInfo ? teamInfo.prefix : '';
        const suffix = teamInfo ? teamInfo.suffix : '';
        const realName = nickInfo.realName;

        const nickSuffix = realName ? ` §7(${realName})` : ` §c[NICK]`;
        const fullDisplayName = prefix + nickInfo.name + nickSuffix + suffix;
        const displayNameJson = JSON.stringify({ text: fullDisplayName });

        setTimeout(() => {
        this.proxyAPI.sendToClient('player_info', {
            action: 3,
            data: [{ UUID: uuid, displayName: displayNameJson }]
        });
        }, 5);
    }

    sendAlert(playerName, realName) {
        setTimeout(() => {
            const cleanPlayerName = playerName.replace(/§./g, '');
            const alertMsg = realName
                ? `§c${realName}§7 is nicked as §c${cleanPlayerName}§7.`
                : `§c${cleanPlayerName}§7 is nicked.`;
            this.proxyAPI.sendChatMessage(this.proxyAPI.currentPlayer.client, `${this.PLUGIN_PREFIX} ${alertMsg}`);

            if (this.config.audioAlerts.enabled && this.userPosition) {
                this.proxyAPI.sendToClient('named_sound_effect', {
                    soundName: 'note.pling',
                    x: this.userPosition.x * 8,
                    y: this.userPosition.y * 8,
                    z: this.userPosition.z * 8,
                    volume: 1.0,
                    pitch: 63
                });
            }
        }, this.config.alertDelay);
    }
}


const KNOWN_NICK_SKINS = new Set([
    "4c7b0468044bfecacc43d00a3a69335a834b73937688292c20d3988cae58248d",
    "3b60a1f6d562f52aaebbf1434f1de147933a3affe0e764fa49ea057536623cd3",
    "19875bb4ac8e7e68c122fdf22bf99abeb4326b96c58ec21d4c5b64cc7a12a5",
    "dd2f967eee43908cda7854df9eb7263637573fd10e498dcdf5d60e9ebc80a1e5",
    "21c44f6b47eadd6720ddc1a14dc4502bd6ccee6542efb74e2b07adb65479cc5",
    "7162726e3b3a7f9c515749a18723ee4439dadd26c0d60e07dea0f2267c6f40a7",
    "10e62bc629872c7d91c2f2edb9643b7455e7238a8c9b4074f1c5312ef162ba22",
    "4336ff82b3d2d7b9081fec5adec2943329531c605b657c11b35231c13a0b8571",
    "173ec57a878e2b5b0922e34be6acac108372f34dace9871a894fe15ed8",
    "7f73526b1a9379be41301cfb74c55270186fbaca63df6949ce3d626e79304d92",
    "7d91aee3b51f3f8d92df52575e5755d97977dcdfb38e74488c613411829e32",
    "8e42e588e1d09ce03c79463e94a7664304f688caf4c617dbcbca64a635bbe79",
    "8f1f9b3919c879f4ec251871c19b20725bc76d657762b5ddfdf3a5ff4f82cb47",
    "989bc66d66ff0513507bcb7aa27f4e7e2af24337c4e7c4786c4630839966fdf7",
    "bdfc818d40b635bcd3d2e3d3b977651d0da0eea87f13847b99dc7bea3338b",
    "5841684ec6a1f8ba919046857dac9175514fef18a2c9395dc3e341b9f5e778ac",
    "211e121448c83125c945cd238dc4f4c5e9a320df5ee3c8c9ad3bb80c055db876",
    "3cce5c4d27979e98afea0d43acca8ebddc7e74a4e62480486e62ee3512",
    "68d98f9a56d4c0ab805c6805756171f4a2cdbf5fa8ce052a4bf4f86411fb080",
    "e2629467cf544e79ed148d3d3842876f2d8841898b4b2e6f60dfc1e02f1179f3",
    "6162abdfb5c7ace7d2caaabdc5d4fdfc32fb63f2a56db69f276167dffce41",
    "af336a55d17916836ce0ed102cbdb0fa6376544971301e0f28beb3899c649ff2",
    "1580729b12e1d6357e7eaa088fbf06ba2c8a2fb35b0ba4c5451937d3f134ca9",
    "1f72e604cdb4c49f7106b594ac87eff3ed6a1999255437241f57d28c45d103f",
    "542a699fe314b9f747eed89b9cae23fdefc27684f6c13dc4a29f5d057cc12d",
    "b2a4cd136505395a876113a800aa8ec15761ca3d945b57e0d0dcdcfeafd7a6d9",
    "907fcce8c3a8d337a6aff226847e3cc7c9bb6bd02f43be1b7c71b3dcd244e11",
    "62a6c3e6b8cbd4fbcb5866289642bb5b5a90dd16e2c28dc054c9d248943834f9",
    "173481eb7f2157a5ad79ec765d36be5736395b72ee519185e23f436ba15185",
    "9ad4ffb57819e7ff633f60b5901e44a3570573ad4d453075b72ae2cbd23c8a6d",
    "8c064476ed9de9ca437cf869127c61a945ea6c308e9b25e4a991bb252c6d754d",
    "9ddd647a59a93c23ce49cece35f7529985ee40d0ca7ead6a1e3fe0f97b286162",
    "c56ab25347aa70f406a85d221da104c5ff05d2a1866a1b57dc1ab4f5feb97",
    "7dcb1d264010bfac568d19e9baee3c2a2aaa729d6cf335b9cf62d2fb2f4c813",
    "fd22ca2c137a6ecf6a4366eb1f2c8a6b173220b295abc1ae13cedf93dabdbf3c",
    "7245bc1d62123b6f8c954cf08be76c9c0d23e778ca9843935a24782c8b2bab",
    "721d9bc16854e75bad69fc7529e3f4c82f32a4715f219697f413c67115a93",
    "e1aa418bd0b4f4d37d6853b7c577eac34034d2f64b6415ff653132f4ca66cd7",
    "c2159fdfe7ef9f12269e2791ebc5aca8e787506b28bfc69747ccf12671261afb",
    "8362ff7077a326747210c56031dc46a141f25454b27873395eda6483d55df",
    "6845756829b6bca516b5bf9251ae31c79cd6ddbc3c57f119370b0ccd8d6f5a1",
    "b77b40e51c7562e523efb0c0f94a616da97c1f485fd8b4a4ac9fb37561812",
    "48b34cc77a18dfa0ebb54f93c3c31779769f519f41b5153c1869aedec9965b2",
    "44d65b5b742333fa051b81b8365155618d4231becd9393283ec639b2f12b7f93",
    "dff36d1281f862f8841d2b84ce17c560e45cd0b3fd879c78c13d26b7c7f7cbfe",
    "1cdeb260f0b31796aca16be0c79ea0169b6f6542fef743c09c4238ad2114a49f",
    "1ab96446ecc368e4c685239fb6d14f7adbf337fb343da95285eec68dd79c4a",
    "7e9437c77b2529da8dbb0545f2898e9a2d12e667f8e6f69f051ced32acfde",
    "b5f0d648162c98c6ee9cb31c4e5cead456dd105a37f7ce8a7a09d384a47b8b2",
    "7f9712869fb1ffbd4905342aca6b7a4f5e47ee9ea7dae5e752c7b9e9bbcea",
    "5485ef7d262e19a65756ec94338777f93b16f64da2783189d0ee34b816b357",
    "869b276cbe44c4a5918beb106e625ae36f829e7c7bcdfad8b67565f48430b199",
    "243ad02c2f5bf1a4b8225a1f6243d507e707fda68237f2aa738467c956be10",
    "dd80f354e47a8b66bddb43ff38d972487aa1105d1eebdb7a26844c140d888e0",
    "32aba3b2955a782f0a3a37bfa9c4173919bdc4827c99bee5670169ec4e181dc",
    "c9939c9d2d9e5e5fb689b12d89e9edf08c915866b7661545fe46e88ab1551",
    "c61aec3d73110435b3c549f7bb70d4aa6d6e6c404590b34be63e6ab42c2946",
    "c96522d14a7a21f59fc2c66ef82fbe62263c9d7d064f823b7c1a614e409099",
    "5a75720a749dca3fee845d6d7e9b2234542f1a2d7d948f040c5ca3e493f5e4",
    "4a213a331b92693ec8f534f627803ac8492df0916b70a762e28aff6a5d8ea2",
    "c149f0fe3a696fad6fd6ad7858ff788b6d15129207b5f72b0d7d7f983e1b",
    "6c175165d75062a323c5865916162ce7eca5e6ac224440c8b0536c96530d33a",
    "acf665de64faf18cbfd1d13598fd4552566c878fbc3716f52587e2cbae44b9",
    "ff167fcbb98ecd6377905add5c15459e3fb815a0b7c9142e8037a818945630e",
    "3e8a56d37decce24f73e3e97e67812a2f5a1384a525f4c0e58cd3fdeffc38",
    "4d6e309a40b631ec6cb5be74e22b883da452f43acf4e834f43c1cb25c8f82a",
    "7417341979bb41714df892d4994d63347006be8bd7f2cfb65b826d2b21172",
    "fe74c2edd110608e523ce6b6b31f528cb38a122941ede2d68d61ba52bd6802e",
    "04426382d98452d90ef2cdb492af67853ca8542972595351acc6cbf88f51532",
    "c35dd24dc529b664504bfd3315b3fe8ca9c6c9b9fe1e84ce6aea216ef7bd3",
    "d2498d91a41fdb77f58c9da73073cc3f287b93ee12ccbfa6473d55019454b1d",
    "3fca4000b6c9b5c7d57f29245bb9ee00af282e351d697a44031d15a1384eb3e8",
    "f3e399b37b4fba7d2fd0ed14f8a6820131d6c9a355282704c59796f092677542",
    "1561ee2ea67346c667b4e96d85847b7b51372b605fe34ae046c8c0d0d2973d",
    "40f836d124597ab614e97ab9bae81bcfacfb9a5cb87b8ce9fc50e5ab93c53dae",
    "52ff1cf6537438f4aff7c2cdcdc84cca8f42f9aa264913827981ace5876f71",
    "8983c344fe3bb69d16caa51766a5bf371ec9075496a061334db9f9a44711",
    "76acbc4d98a2deab2b2b8e7798d5b9ae54e1d5710c9b0e93c243461405d4519",
    "b4c815e8e24ecc26ce18a35a938a5d8b6f96e9c8467841be37699d83e43d",
    "16b5b6a89aa283548411eef311b2ab46216a7b0538452b249386895b917cf2",
    "5ff1fd2453f6d85961de8976bce16c5d514e38ad7f846e99317ca4a3b5889",
    "1b144c7532ec233ffb5c52e69e3d98be12d52481fd5113703f21e1ec850b6",
    "64316ffd3ede6158b3eb421b97cbf9b82dd93e08d54b3f9f0105c75f134f89c",
    "b6966498a988780cd1dcf4ea059eeec6497fe14b95c32470bc6d99b17ff1",
    "b9ec71e4727fde6edef0d08f25561c4ba6eb21583fd9fae443e566c79d88e160",
    "3385c509e1b649552c750dc23c344d24d158df94f6d8532377a9b726462bc05b",
    "59f87bef785eddc72f2289b8482375266bc3ceed365c270c5ef7f835df39",
    "27d4d629ac756da03d894556535bcca033fdaf172e69cc772262b43918ede351",
    "af43feeb32559878e0561c87f8f35c9812973bf27661d874bf68bb569b333f45",
    "ef1f3805eb46853b22559404b373c54b12453c4882abf3dd7673f5869be4cd",
    "7265757c8a5a826f9e2b68e4631fee33e74dcbfcd9e4c744360186f4ff58fa1",
    "3bf9314d6f78711c93d895519bc620a8176819551dc1d498aea840f32cf0d917",
    "ae97b72b9972d5db2516ceda54c6837116c2c52e75763749de9949aaab95d0",
    "6512d4661323db375b829bf2e090f7c3a277f95d3a5613ae59a06d9a9a270",
    "bf948ef3d865729d4120179087c0323a4cb913119932aa620dd9accef7d528a",
    "bb9688ec3a8fb8f18887377bd5be94a56fafb267d870c0532c356cc35adc",
    "4097a9b1113fa753d37d613ab9e118f0d05d3f5276f965f6466bb25d313a0a9",
    "40952ce63957766d68819e9e033429db2f9a472b3646d856e8b839088de699f",
    "59c13c5c833d4205fb899fe6a329f136c5c67ce0dd86efb834684686ead2d",
    "762b16ce467a4096e188f9c12351e66fce8ef1e18b6e9788befe4666c68876",
    "80516a7b5faf2cc796650c51c167773ba8c8e73e94b10d96d3e9d827dd63c5",
    "5a956dc2631e54a3cb62d31390226b5cc052432fc7b9261da4bf6420f8d7e8",
    "156c183d1064d9d72e25de3945ef16483c15eb06b6c87396ab4ba1f8e9b6df",
    "1d387e3e5b89925ce6519cfb4378af11abed6e4b7ae3491f93048971a2e80e7",
    "8fcdcc72bfd5192d752d1a5eac7c11115c9aa43d574dfa85f99f2896c9b15",
    "b6557aa1aaf5fe97745da389ab69473ef9f5ec31960be2860a5c8bd6ed37",
    "a191322292ab595ff53c704b85f514f5b9f45470332ac2719eb85e92df4023",
    "93e15c711b3a37d5634a1b629cb9e43f793f297dd3369c2bdd9b4bba80fa6b",
    "489fd1a12c42e0fed383e9d23bacb95815fb752213849ddaa8b5893ac7eba24",
    "fbd1fa49884dacaed4cc4650d23bfea4dc7a89dce8d90a2e27acfb712e8f8",
    "daa35aa45c2d7092e359962e79d11842ed18ce499aacff22c5871662f7a69dd",
    "447374bbeadeaa36684d3f68eb46bed5b7d145a206d5a54b9c12382d6b1f9dce",
    "9c8f4d6466382820536e82842a162615c2e7d2316afc59264a9c3ede",
    "997eb6a7b37bc8924ed341a4a0a356112b620bbc121b5ce27e692a535d2df81",
    "adc9c2fd56f6698f5807012e4dd2e785e5efe1e6799b47cd1c3bdb1c05eda3c",
    "2d13cdd15b5673a27a63c04226e3b2b3639ac27fb853d1a146a239496da1ff",
    "238580ddf446509b4c84e829b39a8b2f72ab8cd649dca6886405dd2ad2dcd5"
]);
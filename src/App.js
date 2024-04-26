import React from 'react';
import './App.css';
import type {Node} from 'react';
import { fetchBalance } from '@wagmi/core';
import { configureChains, createConfig, WagmiConfig, useAccount, useNetwork } from 'wagmi'; 
import { publicProvider } from 'wagmi/providers/public'; import { disconnect } from '@wagmi/core';
import { getDefaultWallets, RainbowKitProvider, useConnectModal, useChainModal } from '@rainbow-me/rainbowkit'; import '@rainbow-me/rainbowkit/styles.css';
import { readContract } from '@wagmi/core';
import { writeContract } from '@wagmi/core';
import { watchContractEvent } from '@wagmi/core';
import Staking from './Staking.json';
import Coin_FTMCUE from './Coin_FTMCUE.json';
import Exchange from './Exchange.json';

function getNativeBalance(nativeBalance, setNativeBalance, userAddress){
	if (userAddress){
		if (nativeBalance[userAddress]){
			return nativeBalance[userAddress];
		}
		nativeBalance[userAddress] = {k:BigInt('0')};
		setNativeBalance({...nativeBalance});

		fetchBalance({
		  address: userAddress,
		}).then((response) => {
			nativeBalance[userAddress] = {k:response.value, checked:true}; 
			setNativeBalance({...nativeBalance});
		 });

	}
	return {k:BigInt('0')};
}

function getValueFromExistingSmartContract(account, address, jsonFile, functionName, inputTypeList, outputTypeList, chainInfo, setChainInfo, updateChecks, ...argsIn){
	
	var defaultSlate = {};

	function coverValueIfNecc(type, value){
		if (type.t === 'ListType'){
			return value.map((aVal, index)=>{
				return coverValueIfNecc(type.c, aVal);
			})
		}else if (type.t === 'Object'){
			var p = {};
			type.c.forEach((aC, index)=>{
				var cc = coverValueIfNecc(aC, value[aC.n]);
				p[aC.n] = cc;
			})
			return p;
		}else if (type.t === 'UInteger' || type.t === 'Integer'){
			if (!value.hex){
	  			return BigInt(value);
			}
		}else if (type.t === 'Text String'){
			return value.split('.infura').join('');
		}
		return value;
	}

	function flattenType(inputType, aI){
		if (inputType.t === 'ListType'){
			return aI.map((anInput, index)=>{
				return flattenType(inputType.c, anInput);
			}).join(', ');
		}else if (inputType.t === 'UInteger' || inputType.t === 'Integer'){
			return aI.toString();
		}else if (inputType.t === 'Boolean'){
			if (aI){
				return 'true'
			}else{
				return 'false'
			}
		}else if (inputType.t === 'Object'){
			var cc = {};
			inputType.c.forEach((anInput, index)=>{
				var p = flattenType(anInput, aI[anInput.n]);
				cc[anInput.n] = p;
			})
			return JSON.stringify(cc);
		}else if (inputType.t === 'Bytes'){
			return '_';
		}else if (inputType.t === 'Text String' || inputType.t === 'Address'){
			return aI;
		}else{
			console.warn(inputType);
			return aI;
		}
	}

	if (account){

		var args = argsIn.filter((aI, index)=>{
			return index < inputTypeList.length;
		})

		var flattenedInputs = args.map((aI, index)=>{
			var inputType = inputTypeList[+index];
			return flattenType(inputType, aI);
		})

		var point = [address, functionName].concat(flattenedInputs);
		var pOut = layoutFoundationForAnObject(point, chainInfo);
		if (pOut[0] !== undefined){
			return pOut;
		}else{

			function actuallyCheck(){
				var gotNotChecked = false;
				for (var i = 0; i < updateChecks.length; i++){
					if (!updateChecks[i]){
						gotNotChecked = true;
						break;
					}
				}
				if (gotNotChecked){
					setTimeout(function(e){ actuallyCheck(); }, 500);
				}else{

			        var stuff = {
			          address,
			          abi: jsonFile,
			          args,
			          functionName,
			        };

			        readContract(stuff).then((value)=>{
						var k = {checked:true}
						if (outputTypeList.length === 1){
							k[0] = coverValueIfNecc(outputTypeList[0] , value);
						}else{
							for (var i = 0; i < outputTypeList.length; i++){
								var aVal = coverValueIfNecc(outputTypeList[i], value[i]);
								k[i] = aVal;
							}
						}
						replacement(point, chainInfo, k);
						setChainInfo({...chainInfo});
			        }).catch((e)=>{
						console.log(e);
			        });

				}
			}

			actuallyCheck();
			return defaultSlate;
		}
	}else{
		return defaultSlate;
	}
}

function defaultValue(type, path){
	for (var i = 0; i < path.length; i++){
		if (path[i].t === 'l'){
			type = type.c;
		}else if (path[i].t === 'oP'){
			for (var j = 0; j < type.c.length; j++){
				if (type.c[j].n === path[i].v){
					type = type.c[j].t;
					break;
				}
			}
		}
	}

	function processDefault(type){
		if (type.t === 'ListType'){
			return [];
		}else if (type.t === 'Object'){
			var out = {};
			for (var i = 0; i < type.c.length; i++){
				out[type.c[i].n] = processDefault(type.c[i].t);
			}
		}else if (type.t === 'UInteger' || type.t === 'Integer'){
			return BigInt('0');
		}else if (type.t === 'Text String'){
			return '-';
		}else if (type.t === 'Address'){
			return '0x0000000000000000000000000000000000000000'
		}else if (type.t === 'Boolean'){
			return false;
		}
	}
	return processDefault(type);
}

function cleanUpSrc(thisImg){
		if (thisImg.indexOf('ipfs://') === 0){
				thisImg = 'https://ipfs.io/ipfs/' + thisImg.substr(7);
		}
		return thisImg;
}

function makeADecimalTextIntoLongText(decimalText, digits){
		var locOfDot = decimalText.indexOf('.');
		if (locOfDot === -1){
				return decimalText + makeDigits(digits);
		}else{
				var before = decimalText.substr(0, locOfDot);
				var after = decimalText.substr(locOfDot + 1);
				if (after.length > digits){
						return before + after.substr(0, digits);      
				}else{
						return before + after + makeDigits(digits - after.length);
				}
		}
}

function makeDigits(digits){
		var x = '';
		for (var i = 0; i < digits; i++){
				x += '0';
		}
		return x;
}

function dispDateTime(valIn, dispTime, dateFormat, dateSeparator){

		if (!valIn){
			return '0';
		}

		var val = new Date(valIn);

		var dateTxt = '';
		if (dateFormat === 'YYYY_MM_DD'){
				dateTxt = val.getFullYear() + dateSeparator + pad(val.getMonth() + 1) + dateSeparator + pad(val.getDate());
		}else if (dateFormat === 'MM_DD_YYYY'){
				dateTxt = pad(val.getMonth() + 1) + dateSeparator + pad(val.getDate()) + dateSeparator + val.getFullYear();
		}else if (dateFormat === 'DD_MM_YYYY'){
				dateTxt = pad(val.getDate()) + dateSeparator + pad(val.getMonth() + 1) + dateSeparator + val.getFullYear();
		}

		if (dateTxt && dispTime){
				dateTxt += ' ';
		}

		if (dispTime){
				dateTxt += pad(val.getHours()) + ':' + pad(val.getMinutes()) + ':' + pad(val.getSeconds());
		}

		return dateTxt;  
}

const DecimalInputRecall = ({defaultValue, style, className, onChange, idNos, inputValues, setInputValues, gVs}): Node => {

		var onChangeExt = onChange;
		var idOut = [idNos].concat(gVs).join('_');
		
		var value = (inputValues[idOut]? inputValues[idOut] : '');
		
		function setValue(valueIn){
				inputValues[idOut] = valueIn;
				setInputValues({...inputValues});
		}

		React.useEffect(() => {
				setValue(defaultValue + '');
		}, [defaultValue + '']);

		function onChange1(e){
				var valueOut = e.target.value;
				setValue(valueOut);
				if (onChangeExt){
						if (valueOut.indexOf('.') === valueOut.length - 1 || valueOut === '+' ){
						}else{
								onChangeExt(valueOut);
						}
				}
		}

		return <input className={className} value={value} onChange={onChange1} disabled={style.disabled} placeholder={style.placeholder} style={style} />;  
}

function textToDecimal(input){
		var p = isDecimalText(input);
		if (!p){
				return 0;
		}else{
				return +input;
		}
}

const IntegerInputRecall = ({defaultValue, style, className, onChange, idNos, inputValues, setInputValues, gVs}): Node => {

		var onChangeExt = onChange;
		var idOut = [idNos].concat(gVs).join('_');
		
		var value = (inputValues[idOut]? inputValues[idOut] : '');
		
		function setValue(valueIn){
				inputValues[idOut] = valueIn;
				setInputValues({...inputValues});
		}

		const [id1, setId] = React.useState(id);
		React.useEffect(() => {
						setId(id);
		}, [id]);

		function onChange1(e){
				var valueOut = e.target.value;
				if (onChangeExt){
						if (!isIntegerText(valueOut) && valueOut !== '' && valueOut !== '+' && valueOut !== '.'){
								return;
						}
						if (valueOut === '+' ||valueOut === '.'){
								valueOut = '0';
						}
						onChangeExt(BigInt(valueOut), e.target.id);
				}
		}

		return <input className={className} value={value || defaultValue.toString()} disabled={style.disabled} onChange={onChange1}  placeholder={style.placeholder} style={style} />;  
}

function layoutFoundationForAnObject(list, chainInfo){
	var p = chainInfo;
	for (var i = 0; i < list.length; i++){
		var p1 = p[list[i]];
		if (!p1){
			p[list[i]] = {};
			p1 = p[list[i]];
		}
		p = p1;
	}
	return p;
}

function replacement(list, chainInfo, object){
	var p = chainInfo;
	for (var i = 0; i < list.length; i++){
		if (i === list.length - 1){
			p[list[i]] = object;
		}else{
			p = p[list[i]];
		}
	}
}

function pad(nos){
	if (nos < 10){
		return '0' + nos;
	}else{
		return nos;
	}
	}

function isDecimalText(thisVal){
				if (thisVal && (typeof thisVal === 'string' || thisVal instanceof String)){
						var regex3 = /^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)$/
						return thisVal.match(regex3);    
				}
				return false;
		}

function isIntegerText(thisVal){
		if (thisVal && (typeof thisVal === 'string' || thisVal instanceof String)){
				var regex3 = /^([-]?[1-9]\d*|0)$/
				return thisVal.match(regex3);    
		}else{
				return false;
		}
}


const App = (): Node => {

	/* global BigInt */
	const { openConnectModal } = useConnectModal();
	const { openChainModal } = useChainModal();
	const { address, isConnected } = useAccount();
	const { chain } = useNetwork();
	var chainId = BigInt(0);
	if (chain){
		chainId = BigInt(chain.id);
	}
	const [whichScreen, setWhichScreen] = React.useState('1')
	const [inputValues, setInputValues] = React.useState({})
	const [menu, setMenu] = React.useState(false);
	const [nativeBalance, setNativeBalance] = React.useState({});
	const [chainInfo, setChainInfo] = React.useState({});
	function clickActionfe_1__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c1_90345585_i_c0_85cfae97_i_c0_6548c81e_i_c0_bc62bb9c(e){
		if(isConnected
		) {
			setWhichScreen('c3_6374a0a2'); window.scrollTo(0, 0);
		}else{
			if (isConnected){
			if (chainId === BigInt(4002)){
				disconnect();
			}else{
				openChainModal();
			}
		}else{
			openConnectModal();
		}
		getInfo();
		
		};
		e.stopPropagation();
	}
	function clickActionfe_1__s_1_k_c0_f975b388_i_c1_a28ca823_i_c1_b80c1cf0_i_c1_90345585_i_c0_94d5fefd_i_c0_8b4320ee_i_c0_bbda5180(e){
		setWhichScreen('c2_156a2529'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionfe_1__s_1_k_c0_f975b388_i_c1_a28ca823_i_c1_7019d2e6_i_c1_90345585_i_c0_88aa23f3_i_c0_41897547_i_c0_da73dab0(e){
		setWhichScreen('c2_156a2529'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionfe_1__s_1_k_c0_f975b388_i_c1_42c03f43_i_c1_9ee8a453_i_c1_e90648b6_i_c1_d412cb00(e){
		setWhichScreen('c2_156a2529'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionc2_e2bc9d0e(e){
		window.open('https://www.twitter.com');
		e.stopPropagation();
	}
	function clickActionc2_7dddced6(e){
		window.open('https://www.discord.com');
		e.stopPropagation();
	}
	function clickActionfe_1_nv_i_c0_4326e65d(e){
		setWhichScreen('c2_156a2529'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionfe_1_nv_i_c0_bb7754b7(e){
		setWhichScreen('c3_6374a0a2'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionfe_1_nv_i_c0_b0c6a71e(e){
		if (isConnected){
			if (chainId === BigInt(4002)){
				disconnect();
			}else{
				openChainModal();
			}
		}else{
			openConnectModal();
		}
		getInfo();
		
		e.stopPropagation();
	}
	function clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c3_c75c0277_i_c3_044a4a91(e){
		if(isConnected
		) {
			writeContract({ address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, args:['0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', BigInt( makeADecimalTextIntoLongText(50 + '', Number(BigInt('18'))))], functionName: 'approve'}).then((aResponse)=>{ console.log(aResponse);}).catch((e1)=>{
			window.alert(e1)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
			const unwatch = watchContractEvent({address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, eventName: 'Approval'}, (log) => {
					for (var i12 = 0; i12 < log.length; i12++){
						var aLog = log[i12].args;
						if (((address ? address : '') === aLog.owner) && ('0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7' === aLog.spender)){
							unwatch(); 
			writeContract({ address:'0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', abi: Staking.abi, args:[BigInt( makeADecimalTextIntoLongText(50 + '', Number(BigInt('18'))))], functionName: 'stake1'}).then((aResponse)=>{ console.log(aResponse);}).catch((e2)=>{
			window.alert(e2)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);}); break;
						}
					}
				}
			);
		}else{
			if (isConnected){
			if (chainId === BigInt(4002)){
				disconnect();
			}else{
				openChainModal();
			}
		}else{
			openConnectModal();
		}
		getInfo();
		
		};
		e.stopPropagation();
	}
	function clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c3_edb40381_i_c3_c75c0277_i_c3_044a4a91(e){
		if(isConnected
		) {
			writeContract({ address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, args:['0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', BigInt( makeADecimalTextIntoLongText(100 + '', Number(BigInt('18'))))], functionName: 'approve'}).then((aResponse)=>{ console.log(aResponse);}).catch((e1)=>{
			window.alert(e1)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
			const unwatch = watchContractEvent({address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, eventName: 'Approval'}, (log) => {
					for (var i12 = 0; i12 < log.length; i12++){
						var aLog = log[i12].args;
						if (((address ? address : '') === aLog.owner) && ('0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7' === aLog.spender)){
							unwatch(); 
			writeContract({ address:'0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', abi: Staking.abi, args:[BigInt( makeADecimalTextIntoLongText(100 + '', Number(BigInt('18'))))], functionName: 'stake2'}).then((aResponse)=>{ console.log(aResponse);}).catch((e2)=>{
			window.alert(e2)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);}); break;
						}
					}
				}
			);
		}else{
			if (isConnected){
			if (chainId === BigInt(4002)){
				disconnect();
			}else{
				openChainModal();
			}
		}else{
			openConnectModal();
		}
		getInfo();
		
		};
		e.stopPropagation();
	}
	function clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c3_ec97c72d_i_c3_c75c0277_i_c3_044a4a91(e){
		writeContract({ address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, args:['0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', BigInt( makeADecimalTextIntoLongText(200 + '', Number(BigInt('18'))))], functionName: 'approve'}).then((aResponse)=>{ console.log(aResponse);}).catch((e0)=>{
		window.alert(e0)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
		const unwatch = watchContractEvent({address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, eventName: 'Approval'}, (log) => {
					for (var i12 = 0; i12 < log.length; i12++){
						var aLog = log[i12].args;
						if (((address ? address : '') === aLog.owner) && ('0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7' === aLog.spender)){
							unwatch(); 
		writeContract({ address:'0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', abi: Staking.abi, args:[BigInt( makeADecimalTextIntoLongText(200 + '', Number(BigInt('18'))))], functionName: 'stake3'}).then((aResponse)=>{ console.log(aResponse);}).catch((e1)=>{
		window.alert(e1)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);}); break;
						}
					}
				}
			);
		e.stopPropagation();
	}
	function clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c3_914fc1ca_i_c3_c75c0277_i_c3_044a4a91(e){
		if(isConnected
		) {
		}else{
			if (isConnected){
			if (chainId === BigInt(4002)){
				disconnect();
			}else{
				openChainModal();
			}
		}else{
			openConnectModal();
		}
		getInfo();
		
		};
		e.stopPropagation();
	}
	function clickActionc0_8d9c5f83(e){
		function downPath(){
			if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); }([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).checked){
				if((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('0') * BigInt('60') * BigInt('24') * BigInt('24')))) < (BigInt(Math.floor(new Date()/1000)))
				) {
					function downPath_0(){
						if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); }([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).checked){
							writeContract({ address:'0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', abi: Staking.abi, args:[function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])], functionName: 'unstake1'}).then((aResponse)=>{ console.log(aResponse);}).catch((e1)=>{
							window.alert(e1)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
						}else{
							setTimeout(function(e){downPath_0()}, 500);
						}
					}
					downPath_0()
				}else{
				};
			}else{
				setTimeout(function(e){downPath()}, 500);
			}
		}
		downPath()
		e.stopPropagation();
	}
	function clickActionc43_3b24a20a(e){
		function downPath(){
			if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); }([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).checked){
				if((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('3') * BigInt('60') * BigInt('24') * BigInt('24')))) < (BigInt(Math.floor(new Date()/1000)))
				) {
					function downPath_0(){
						if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); }([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).checked){
							writeContract({ address:'0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', abi: Staking.abi, args:[function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])], functionName: 'unstake2'}).then((aResponse)=>{ console.log(aResponse);}).catch((e1)=>{
							window.alert(e1)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
						}else{
							setTimeout(function(e){downPath_0()}, 500);
						}
					}
					downPath_0()
				}else{
				};
			}else{
				setTimeout(function(e){downPath()}, 500);
			}
		}
		downPath()
		e.stopPropagation();
	}
	function clickActionc43_83b89848(e){
		function downPath(){
			if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); }([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).checked){
				if((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('5') * BigInt('60') * BigInt('24') * BigInt('24')))) < (BigInt(Math.floor(new Date()/1000)))
				) {
					function downPath_0(){
						if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); }([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).checked){
							writeContract({ address:'0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', abi: Staking.abi, args:[function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])], functionName: 'unstake3'}).then((aResponse)=>{ console.log(aResponse);}).catch((e1)=>{
							window.alert(e1)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
						}else{
							setTimeout(function(e){downPath_0()}, 500);
						}
					}
					downPath_0()
				}else{
				};
			}else{
				setTimeout(function(e){downPath()}, 500);
			}
		}
		downPath()
		e.stopPropagation();
	}
	function clickActionc2_9bfcb1c8(e){
		window.open('https://www.twitter.com');
		e.stopPropagation();
	}
	function clickActionc2_45c5f338(e){
		window.open('https://www.discord.com');
		e.stopPropagation();
	}
	function clickActionfe_c2_156a2529_nv_i_c0_868d8d8e(e){
		setWhichScreen('1'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionfe_c2_156a2529_nv_i_c0_bb7754b7(e){
		setWhichScreen('c3_6374a0a2'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionfe_c2_156a2529_nv_i_c0_b0c6a71e(e){
		if (isConnected){
			if (chainId === BigInt(4002)){
				disconnect();
			}else{
				openChainModal();
			}
		}else{
			openConnectModal();
		}
		getInfo();
		
		e.stopPropagation();
	}
	function changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c4_4fc50d58_i_c4_62c85b33(value){
		function downPath(){
			if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange1To2rate', [], outputTypeList, chainInfo, setChainInfo, [], []); }([{t:'UInteger'}], []).checked){
				inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c0_44a30b06 i c5_21d800c3'] = ((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange1To2rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange1To2rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) * textToDecimal(inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c4_4fc50d58 i c4_62c85b33'])).toString(); setInputValues({...inputValues}); 
			}else{
				setTimeout(function(e){downPath()}, 500);
			}
		}
		downPath()
		inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c4_4fc50d58 i c4_62c85b33'] = value + '';
		setInputValues({...inputValues})
	}
	function changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c0_44a30b06_i_c5_21d800c3(value){
		function downPath(){
			if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange1To2rate', [], outputTypeList, chainInfo, setChainInfo, [], []); }([{t:'UInteger'}], []).checked){
				inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c4_4fc50d58 i c4_62c85b33'] = ((1 / (BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange1To2rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange1To2rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))) * textToDecimal(inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c0_44a30b06 i c5_21d800c3'])).toString(); setInputValues({...inputValues}); 
			}else{
				setTimeout(function(e){downPath()}, 500);
			}
		}
		downPath()
		inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c0_44a30b06 i c5_21d800c3'] = value + '';
		setInputValues({...inputValues})
	}
	function clickActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c3_c75c0277_i_c3_044a4a91(e){
		writeContract({ address:'0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', abi: Exchange.abi, args:[], functionName: 'exchange1To2', value:BigInt( makeADecimalTextIntoLongText(textToDecimal(inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c4_4fc50d58 i c4_62c85b33']) + '', 18))}).then((aResponse)=>{ console.log(aResponse);}).catch((e0)=>{
		window.alert(e0)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
		e.stopPropagation();
	}
	function changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c5_ed473511_i_c4_4fc50d58_i_c4_62c85b33(value){
		function downPath(){
			if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange2To1rate', [], outputTypeList, chainInfo, setChainInfo, [], []); }([{t:'UInteger'}], []).checked){
				inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c0_b7ab97f8 i c0_15d1fd10'] = ((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange2To1rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange2To1rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) * textToDecimal(inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c4_4fc50d58 i c4_62c85b33'])).toString(); setInputValues({...inputValues}); 
			}else{
				setTimeout(function(e){downPath()}, 500);
			}
		}
		downPath()
		inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c4_4fc50d58 i c4_62c85b33'] = value + '';
		setInputValues({...inputValues})
	}
	function changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c5_ed473511_i_c0_b7ab97f8_i_c0_15d1fd10(value){
		function downPath(){
			if (function(outputTypeList, pathDownList){ return getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange2To1rate', [], outputTypeList, chainInfo, setChainInfo, [], []); }([{t:'UInteger'}], []).checked){
				inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c4_4fc50d58 i c4_62c85b33'] = ((1 / (BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange2To1rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', Exchange.abi, 'exchange2To1rate', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))) * textToDecimal(inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c0_b7ab97f8 i c0_15d1fd10'])).toString(); setInputValues({...inputValues}); 
			}else{
				setTimeout(function(e){downPath()}, 500);
			}
		}
		downPath()
		inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c0_b7ab97f8 i c0_15d1fd10'] = value + '';
		setInputValues({...inputValues})
	}
	function clickActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c5_ed473511_i_c3_c75c0277_i_c3_044a4a91(e){
		writeContract({ address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, args:['0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', BigInt( makeADecimalTextIntoLongText(textToDecimal(inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c4_4fc50d58 i c4_62c85b33']) + '', Number(BigInt('18'))))], functionName: 'increaseAllowance'}).then((aResponse)=>{ console.log(aResponse);}).catch((e0)=>{
		window.alert(e0)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);})
		const unwatch = watchContractEvent({address:'0x43995D5A8221841AD6c1F28C1ea8cA802214a318', abi: Coin_FTMCUE.abi, eventName: 'Approval'}, (log) => {
					for (var i12 = 0; i12 < log.length; i12++){
						var aLog = log[i12].args;
						if (((address ? address : '') === aLog.owner) && ('0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685' === aLog.spender)){
							unwatch(); 
		writeContract({ address:'0x0368aD8B2e334A5f3cFEfA01719f0D34d0557685', abi: Exchange.abi, args:[BigInt( makeADecimalTextIntoLongText(textToDecimal(inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c4_4fc50d58 i c4_62c85b33']) + '', Number(BigInt('18'))))], functionName: 'exchange2To1'}).then((aResponse)=>{ console.log(aResponse);}).catch((e1)=>{
		window.alert(e1)}).finally(() => {setTimeout(function(){setChainInfo({});}, 15000);}); break;
						}
					}
				}
			);
		e.stopPropagation();
	}
	function clickActionc3_15dfb41f(e){
		window.open('https://www.twitter.com');
		e.stopPropagation();
	}
	function clickActionc3_7526c28e(e){
		window.open('https://www.discord.com');
		e.stopPropagation();
	}
	function clickActionfe_c3_6374a0a2_nv_i_c0_868d8d8e(e){
		setWhichScreen('1'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function clickActionfe_c3_6374a0a2_nv_i_c0_4326e65d(e){
		setWhichScreen('c2_156a2529'); window.scrollTo(0, 0);
		e.stopPropagation();
	}
	function getInfo(){
		setNativeBalance({}); setChainInfo({}); 
	}
	if (whichScreen === '1'){
		return <div style={{color:'rgb(255, 255, 255)', fontFamily:'Alegreya Sans', backgroundColor:'rgb(36, 36, 62)'}}>
			<nav className='navbar navbar-expand-md  navbar-light' style={{backgroundColor:'rgb(34, 33, 49)'}}>
				<span className='navbar-brand'><img src={'https://www.cues.sg/client_pictures/64_0oReGBpO.png'} style={{width:'2em'}} alt='logo' /><span ></span></span><button className='navbar-toggler' onClick={(e)=>{setMenu(!menu)}} style={{borderColor:'black', border: '0'}}></button><div className={'collapse navbar-collapse' + (menu ? ' show' : '')}>
				<ul className='navbar-nav ml-auto'><li className='nav-item'><div className='nav-link' href='#' style={{color:'rgb(255, 255, 255)', fontWeight:(1 ? 'bold' : 'normal')}}>{'Dashboard'}</div></li></ul>
				<ul className='navbar-nav ml-auto'><li className='nav-item'><div className='nav-link' href='#' style={{color:'rgb(255, 255, 255)', cursor:'pointer'}} onClick={clickActionfe_1_nv_i_c0_4326e65d} >{'Mint'}</div></li></ul>
				<ul className='navbar-nav ml-auto'><li className='nav-item'><div className='nav-link' href='#' style={{color:'rgb(255, 255, 255)', cursor:'pointer'}} onClick={clickActionfe_1_nv_i_c0_bb7754b7} >{'Trade'}</div></li></ul>
				<ul className='navbar-nav ml-auto'><li className='nav-item'>
<button style={{cursor:'pointer'}} className='btn btn-normalLightRed  '  onClick={clickActionfe_1_nv_i_c0_b0c6a71e} >{'Connect Wallet'}</button></li></ul></div>
			</nav>
			<div style={{position:'relative', width:'100vw', overflow:'hidden', zIndex:0, backgroundColor:''}}>
				<div className=' '><div style={{backgroundColor:''}} className='      container-fluid'>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-4  mb-4  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'35px'}}><b>My Statistics</b></span>
						</div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='   col-7'><div style={{backgroundColor:''}} className='     '>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{color:'rgb(248, 229, 229)'}}>Wallet</span></span>
										</div>
									</div></div>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}>
											<span key={0} style={{fontSize:'30px', fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(getNativeBalance(nativeBalance, setNativeBalance, (address ? address : '')).k / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(getNativeBalance(nativeBalance, setNativeBalance, (address ? address : '')).k) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
										</div>
									</div></div>
								</div></div>
								<div className='   col-4'><div style={{backgroundColor:''}} className='      container-fluid'>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-center'>
										<button style={{cursor:'pointer'}} className='btn btn-outline-light    col-12  mt-4  mb-4  '  onClick={clickActionfe_1__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c1_90345585_i_c0_85cfae97_i_c0_6548c81e_i_c0_bc62bb9c} >{(isConnected ? 'Exchange' : 'Connect')}</button>
									</div></div>
								</div></div>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='   col-7'><div style={{backgroundColor:''}} className='     '>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{color:'rgb(248, 229, 229)'}}>Overall Staked</span></span>
										</div>
									</div></div>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}>
											<span key={0} style={{fontSize:'30px', fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number(((BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))))), Number(BigInt('2')), false))}</span>
										</div>
									</div></div>
								</div></div>
								<div className='   col-4'><div style={{backgroundColor:''}} className='      container-fluid'>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<button style={{cursor:'pointer'}} className='btn btn-outline-light    col-12  mt-4  mb-4  '  onClick={clickActionfe_1__s_1_k_c0_f975b388_i_c1_a28ca823_i_c1_b80c1cf0_i_c1_90345585_i_c0_94d5fefd_i_c0_8b4320ee_i_c0_bbda5180} >{'Stake'}</button>
									</div></div>
								</div></div>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='   col-7'><div style={{backgroundColor:''}} className='     '>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{color:'rgb(248, 229, 229)'}}>Rewards</span></span>
										</div>
									</div></div>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}>
											<span key={0} style={{fontSize:'30px', fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number(((BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'interestEarnedUpToNowBeforeTaxesAndNotYetWithdrawn1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'interestEarnedUpToNowBeforeTaxesAndNotYetWithdrawn1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'interestEarnedUpToNowBeforeTaxesAndNotYetWithdrawn2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'interestEarnedUpToNowBeforeTaxesAndNotYetWithdrawn2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'interestEarnedUpToNowBeforeTaxesAndNotYetWithdrawn3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'interestEarnedUpToNowBeforeTaxesAndNotYetWithdrawn3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))))), Number(BigInt('2')), false))}</span>
										</div>
									</div></div>
								</div></div>
								<div className='   col-4'><div style={{backgroundColor:''}} className='      container-fluid'>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<button style={{cursor:'pointer'}} className='btn btn-outline-light    col-12  mt-4  mb-4  '  onClick={clickActionfe_1__s_1_k_c0_f975b388_i_c1_a28ca823_i_c1_7019d2e6_i_c1_90345585_i_c0_88aa23f3_i_c0_41897547_i_c0_da73dab0} >{'Claim'}</button>
									</div></div>
								</div></div>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='   col-6'><div style={{backgroundColor:''}} className='     '>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{color:'rgb(248, 229, 229)'}}>Wolf Balance </span></span>
										</div>
									</div></div>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}>
											<span key={0} style={{fontSize:'30px', fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'balanceOf', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'balanceOf', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
										</div>
									</div></div>
								</div></div>
								<div className='   col-6'><div style={{backgroundColor:''}} className='     '>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{color:'rgb(248, 229, 229)'}}>Wolf Price</span></span><br/>
										</div>
									</div></div>
									<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
										<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><b>$0.9</b></span>
										</div>
									</div></div>
								</div></div>
							</div></div>
						</div></div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-1  mb-1  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='   col-12'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{color:'rgb(248, 229, 229)'}}>Current Nodes</span></span>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}>You do not have any nodes.</span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<button style={{cursor:'pointer'}} className='btn btn-outline-light    col-4    '  onClick={clickActionfe_1__s_1_k_c0_f975b388_i_c1_42c03f43_i_c1_9ee8a453_i_c1_e90648b6_i_c1_d412cb00} >{'Mint Node'}</button>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-2  mb-2  '/>
							</div></div>
						</div></div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-5  mb-5  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'35px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Global Statistics</b></span></span><br/>
						</div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='   col-12 col-sm-4'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}>Total Nodes</span></span></span><br/>
									<span key={2} style={{fontSize:'30px'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number(((BigInt('0') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'numberOfAddressesCurrentlyStaked1', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('0') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'numberOfAddressesCurrentlyStaked1', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('0')))) + (BigInt('0') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'numberOfAddressesCurrentlyStaked2', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('0') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'numberOfAddressesCurrentlyStaked2', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('0')))) + (BigInt('0') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'numberOfAddressesCurrentlyStaked3', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('0') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'numberOfAddressesCurrentlyStaked3', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('0')))))), Number(BigInt('0')), false))}</span><br/>
								</div>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-4'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}>Total Staked</span></span></span>
									<div key={1}>
										<span key={0} style={{fontSize:'30px'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number(((BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalStakedAmount1', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalStakedAmount1', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalStakedAmount2', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalStakedAmount2', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalStakedAmount3', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalStakedAmount3', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))))), Number(BigInt('2')), false))}</span>
									</div>
								</div>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-4'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}>Total Wolf (Supply)</span></span></span>
									<div key={1}><span key={0} style={{fontSize:'30px'}}>500 Wolf</span><br/>
									</div>
								</div>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-4'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}>Total Wolf (Circulating)</span></span></span>
									<div key={1}>
										<span key={0} style={{fontSize:'30px'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'totalSupply', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'totalSupply', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span><br/>
									</div>
								</div>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-4'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}>Total Rewards</span></span></span>
									<div key={1}>
										<span key={0} style={{fontSize:'30px'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number(((BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalClaimedRewards', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalClaimedRewards', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('4') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalUnclaimedRewards', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('4')))) /(10 ** Number(BigInt('4'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'totalUnclaimedRewards', [], outputTypeList, chainInfo, setChainInfo, [], []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))))), Number(BigInt('2')), false))}</span><br/>
									</div>
								</div>
							</div></div>
						</div></div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-2  mb-2  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-2  mb-2  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-2  mb-2  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-2  mb-2  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'12px'}}><span style={{color:'rgb(255, 255, 255)'}}><i>Wolf Financial 2022</i></span></span>
						</div>
						<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>
							<span key={0} style={{fontSize:'12px', color:'rgb(255, 255, 255)', cursor:'pointer', cursor:'pointer'}} onClick={clickActionc2_e2bc9d0e} >{'Twitter.'}</span>
							<span key={1} style={{fontSize:'12px', color:'rgb(255, 255, 255)', cursor:'pointer', cursor:'pointer'}} onClick={clickActionc2_7dddced6} >{'Discord.'}</span>
						</div>
					</div></div>
				</div></div>
			</div></div>
	}else if (whichScreen === 'c2_156a2529'){
		return <div style={{color:'rgb(255, 255, 255)', fontFamily:'Alegreya Sans', backgroundColor:'rgb(36, 36, 62)'}}>
			<nav className='navbar  navbar-light' style={{backgroundColor:'rgb(34, 33, 49)'}}>
				<span className='navbar-brand'><img src={'https://www.cues.sg/client_pictures/64_0oReGBpO.png'} style={{width:'2em'}} alt='logo' /><span ></span></span>
				<div className='nav-link' href='#' style={{cursor:'pointer'}} onClick={clickActionfe_c2_156a2529_nv_i_c0_868d8d8e} >{'Dashboard'}</div>
				<div className='nav-link' href='#' style={{fontWeight:(1 ? 'bold' : 'normal')}}>{'Mint'}</div>
				<div className='nav-link' href='#' style={{cursor:'pointer'}} onClick={clickActionfe_c2_156a2529_nv_i_c0_bb7754b7} >{'Trade'}</div>
				
<button style={{cursor:'pointer'}} className='btn btn-normalLightRed  '  onClick={clickActionfe_c2_156a2529_nv_i_c0_b0c6a71e} >{'Connect Wallet'}</button>
			</nav>
			<div style={{position:'relative', width:'100vw', overflow:'hidden', zIndex:0, backgroundColor:''}}>
				<div className=' '><div style={{backgroundColor:''}} className='      container-fluid'>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-4  mb-4  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Node Types</b></span></span><br/>
						</div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-9      text-left' style={{lineHeight:'2.09em', borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}><b>Node Alpha</b></span></span></span><br/>
								</div>
								<div className='  col-3      text-center' style={{backgroundColor:'rgb(132, 121, 225)', lineHeight:'2.29em', borderColor:'rgb(0,0,0)', borderWidth:1, borderStyle:'none', borderRadius:'1em', padding:10}}>
									<div key={0}><span key={0} style={{fontSize:'1em'}}><b>Starter</b></span><br/>
									</div>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<div  className='   col-4     '><img alt='generatedImage' src={cleanUpSrc('https://cdn.pixabay.com/photo/2020/11/14/19/36/astronaut-5743702_1280.png')} style={{borderWidth:0, width:'80%'}}/></div>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-0  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}>Cost</span></span><br/>
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>50 Wolf</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}>Reward/Day</span></span><br/>
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>1 Wolf</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}>Monthly Fee</span></span><br/>
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>$10</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}>Min Num of Days</span></span><br/>
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>7 Days</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<button style={{cursor:'pointer'}} className='btn btn-light    col-3    '  onClick={clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c3_c75c0277_i_c3_044a4a91} >{'Stake'}</button>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-9      text-left' style={{lineHeight:'2.09em', borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}><b>Node Beta</b></span></span></span><br/>
								</div>
								<div className='  col-3      text-center' style={{backgroundColor:'rgb(132, 121, 225)', lineHeight:'2.29em', borderColor:'rgb(0,0,0)', borderWidth:1, borderStyle:'none', borderRadius:'1em', padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Popular</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<div  className='   col-4     '><img alt='generatedImage' src={cleanUpSrc('https://cdn.pixabay.com/photo/2020/11/14/19/36/astronaut-5743702_1280.png')} style={{borderWidth:0, width:'80%'}}/></div>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-0  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}>Cost</span></span><br/>
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>100 Wolf</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}>Reward/Day</span></span><br/>
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>1.5 Wolf</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Monthly Fee
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>$12</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Min Num of Days
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>10 Days</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<button style={{cursor:'pointer'}} className='btn btn-light    col-3    '  onClick={clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c3_edb40381_i_c3_c75c0277_i_c3_044a4a91} >{'Stake'}</button>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-9      text-left' style={{lineHeight:'2.09em', borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}><b>Node Gamma</b></span></span></span><br/>
								</div>
								<div className='  col-3      text-center' style={{backgroundColor:'rgb(132, 121, 225)', lineHeight:'2.29em', borderColor:'rgb(0,0,0)', borderWidth:1, borderStyle:'none', borderRadius:'1em', padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Tester</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<div  className='   col-4     '><img alt='generatedImage' src={cleanUpSrc('https://cdn.pixabay.com/photo/2020/11/14/19/36/astronaut-5743702_1280.png')} style={{borderWidth:0, width:'80%'}}/></div>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-0  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Cost
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>200 Wolf</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Reward/Day
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>2 Wolf</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Monthly Fee
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>$20</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Min Num of Days
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>5 Days</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<button style={{cursor:'pointer'}} className='btn btn-light    col-3    '  onClick={clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c3_ec97c72d_i_c3_c75c0277_i_c3_044a4a91} >{'Stake'}</button>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-9      text-left' style={{lineHeight:'2.09em', borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{fontFamily:'Alegreya Sans'}}><span style={{color:'rgb(248, 229, 229)'}}><b>Node Delta</b></span></span></span><br/>
								</div>
								<div className='  col-3      text-center' style={{backgroundColor:'rgb(132, 121, 225)', lineHeight:'2.29em', borderColor:'rgb(0,0,0)', borderWidth:1, borderStyle:'none', borderRadius:'1em', padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Ultimate</b></span></span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<div  className='   col-4     '><img alt='generatedImage' src={cleanUpSrc('https://cdn.pixabay.com/photo/2020/11/14/19/36/astronaut-5743702_1280.png')} style={{borderWidth:0, width:'80%'}}/></div>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-0  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Cost
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>300 Wolf</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Reward/Day
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>2.5 Wolf</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Monthly Fee
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>$25</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Min Num of Days
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>30 Days</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<button style={{cursor:'pointer'}} className='btn btn-light    col-3    '  onClick={clickActionfe_c2_156a2529__s_1_k_c0_f975b388_i_c1_a28ca823_i_c3_914fc1ca_i_c3_c75c0277_i_c3_044a4a91} >{'Stake'}</button>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
						</div></div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-1  mb-1  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='   col-12'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'18px'}}><span style={{color:'rgb(248, 229, 229)'}}>Current Nodes</span></span>
								</div>
							</div></div>
							<div className=' '><div style={{display:(((((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18')))) + (BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))) === 0) ? true : false) ? 'none' : ''), backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{borderWidth:0, padding:10}}>You do not have any nodes.
								</div>
							</div></div>
							<div className=' '><div style={{display:(((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) > BigInt('0')) ? false : true) ? 'none' : ''), backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}><b key={0}>Node Type </b>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}><b key={0}>Stake Amt </b>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}><b key={0}>Stake Period</b>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}><b key={0}>Can Unstake?</b>
								</div>
							</div></div>
							<div className=' '><div style={{display:(((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) > BigInt('0')) ? false : true) ? 'none' : ''), backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>Node Alpha
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0}>{dispDateTime(Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) * 1000, false, 'YYYY_MM_DD', '-')}</span>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0} style={{fontWeight:(((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('0') * BigInt('24') * BigInt('60') * BigInt('60')))) < (BigInt(Math.floor(new Date()/1000))) ? true : false) ? 'bold' : 'normal'), cursor:'pointer', cursor:'pointer'}} onClick={clickActionc0_8d9c5f83} >{((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap1', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('0') * BigInt('24') * BigInt('60') * BigInt('60')))) < (BigInt(Math.floor(new Date()/1000))) ? 'Yes' : 'No')}</span>
								</div>
							</div></div>
							<div className=' '><div style={{display:(((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) > BigInt('0')) ? false : true) ? 'none' : ''), backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>Node Beta
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0}>{dispDateTime(Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) * 1000, false, 'YYYY_MM_DD', '-')}</span>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0} style={{fontWeight:(((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('3') * BigInt('24') * BigInt('60') * BigInt('60')))) < (BigInt(Math.floor(new Date()/1000))) ? true : false) ? 'bold' : 'normal'), cursor:'pointer', cursor:'pointer'}} onClick={clickActionc43_3b24a20a} >{((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap2', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('3') * BigInt('24') * BigInt('60') * BigInt('60')))) < (BigInt(Math.floor(new Date()/1000))) ? 'Yes' : 'No')}</span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{display:(((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) > BigInt('0')) ? false : true) ? 'none' : ''), backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>Node Gamma
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0}>{dispDateTime(Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], [])) * 1000, false, 'YYYY_MM_DD', '-')}</span>
								</div>
								<div className='  col-3      text-left' style={{borderWidth:0, padding:10}}>
									<span key={0} style={{fontWeight:(((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('5') * BigInt('24') * BigInt('60') * BigInt('60')))) < (BigInt(Math.floor(new Date()/1000))) ? true : false) ? 'bold' : 'normal'), cursor:'pointer', cursor:'pointer'}} onClick={clickActionc43_83b89848} >{((function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0xEC6d87594F0F84Cd1B47B5d4Ba585F6a24A9d3F7', Staking.abi, 'addressMap3', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[1];}else{return defaultValue(outputTypeList[1], pathDownList)}}([{t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}, {t:'UInteger'}], []).add((BigInt('5') * BigInt('24') * BigInt('60') * BigInt('60')))) < (BigInt(Math.floor(new Date()/1000))) ? 'Yes' : 'No')}</span><br/>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-2  mb-2  '/>
							</div></div>
						</div></div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-2  mb-2  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'12px'}}><i>Wolf Financial 2022</i></span>
						</div>
						<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>
							<span key={0} style={{fontSize:'12px', cursor:'pointer', cursor:'pointer'}} onClick={clickActionc2_9bfcb1c8} >{'Twitter.'}</span>
							<span key={1} style={{fontSize:'12px', cursor:'pointer', cursor:'pointer'}} onClick={clickActionc2_45c5f338} >{'Discord.'}</span>
						</div>
					</div></div>
				</div></div>
			</div></div>
	}else if (whichScreen === 'c3_6374a0a2'){
		return <div style={{color:'rgb(255, 255, 255)', fontFamily:'Alegreya Sans', backgroundColor:'rgb(36, 36, 62)'}}>
			<nav className='navbar  navbar-light' style={{backgroundColor:'rgb(34, 33, 49)'}}>
				<span className='navbar-brand'><img src={'https://www.cues.sg/client_pictures/64_0oReGBpO.png'} style={{width:'2em'}} alt='logo' /><span ></span></span>
				<div className='nav-link' href='#' style={{cursor:'pointer'}} onClick={clickActionfe_c3_6374a0a2_nv_i_c0_868d8d8e} >{'Dashboard'}</div>
				<div className='nav-link' href='#' style={{cursor:'pointer'}} onClick={clickActionfe_c3_6374a0a2_nv_i_c0_4326e65d} >{'Mint'}</div>
				<div className='nav-link' href='#' style={{fontWeight:(1 ? 'bold' : 'normal')}}>{'Trade'}</div>
				
<button className='btn btn-normalLightRed  ' >{'Connect Wallet'}</button>
			</nav>
			<div style={{position:'relative', width:'100vw', overflow:'hidden', zIndex:0, backgroundColor:''}}>
				<div className=' '><div style={{backgroundColor:''}} className='      container-fluid'>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-4  mb-4  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12      text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Trade Wolf</b></span></span><br/>
						</div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{lineHeight:'2.09em', borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{color:'rgb(248, 229, 229)'}}><b>Buy Wolf</b></span></span>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-0  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>BNB
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>Balance: </b>
									<span key={1} style={{color:'rgb(255, 255, 255)', fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(getNativeBalance(nativeBalance, setNativeBalance, (address ? address : '')).k / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(getNativeBalance(nativeBalance, setNativeBalance, (address ? address : '')).k) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-1    '/>
								<div  className='  col-10    ml-0  mr-0' style={{padding:'0'}}><DecimalInputRecall defaultValue={0} className='form-control   text-left ' style={{backgroundColor:'', placeholder:'', disabled:false}} onChange={changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c4_4fc50d58_i_c4_62c85b33}  gVs={[]} setInputValues={setInputValues} inputValues={inputValues} idNos={'fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c4_4fc50d58 i c4_62c85b33'}/>{function(){ var p = []; var valueOut = inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c4_4fc50d58 i c4_62c85b33']; if (!isDecimalText(valueOut) && valueOut){ p.push('Not a Decimal');};  if (p.length > 0){ return <center><p style={{color:'red'}}>{p.join(', ')}</p></center>}else{ return null; }}()}</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{borderWidth:0, padding:5}}><b key={0}>TO</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Wolf
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Balance: </b></span></span>
									<span key={1} style={{color:'rgb(255, 255, 255)', fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'balanceOf', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'balanceOf', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-1    '/>
								<div  className='  col-10    ' style={{padding:'0'}}><DecimalInputRecall defaultValue={0} className='form-control   text-left ' style={{backgroundColor:'', placeholder:''}} onChange={changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c0_44a30b06_i_c5_21d800c3}  gVs={[]} setInputValues={setInputValues} inputValues={inputValues} idNos={'fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c0_44a30b06 i c5_21d800c3'}/>{function(){ var p = []; var valueOut = inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c0_44a30b06 i c5_21d800c3']; if (!isDecimalText(valueOut) && valueOut){ p.push('Not a Decimal');};  if (p.length > 0){ return <center><p style={{color:'red'}}>{p.join(', ')}</p></center>}else{ return null; }}()}</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{borderWidth:0, padding:10}}>Slippage Tolerance (%)
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-1    '/>
								<div  className='  col-10    ' style={{padding:'0'}}><IntegerInputRecall defaultValue={0} className='form-control   text-left ' style={{backgroundColor:'', placeholder:''}} gVs={[]} setInputValues={setInputValues} inputValues={inputValues} idNos={'fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c5_3edeb688 i c5_21d800c3'}/>{function(){ var p = []; var valueOut = inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c2_f83b98b2 i c5_3edeb688 i c5_21d800c3']; if (!isIntegerText(valueOut) && valueOut){ p.push('Not an Integer');};  if (p.length > 0){ return <center><p style={{color:'red'}}>{p.join(', ')}</p></center>}else{ return null; }}()}</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<button style={{cursor:'pointer'}} className='btn btn-light    col-3    '  onClick={clickActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c2_f83b98b2_i_c3_c75c0277_i_c3_044a4a91} >{'Trade'}</button>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
						</div></div>
						<div className='   col-12 col-sm-6'><div style={{borderColor:'rgb(250, 37, 94)', borderWidth:1, borderStyle:'none', borderRadius:'1em', backgroundColor:'rgb(72, 70, 109)'}} className='  mt-2  mb-2    container-fluid'>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{lineHeight:'2.09em', borderWidth:0, padding:10}}><span key={0} style={{fontSize:'30px'}}><span style={{color:'rgb(248, 229, 229)'}}><b>Sell Wolf</b></span></span>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-0  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>Wolf
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><b key={0}>Balance: </b>
									<span key={1} style={{fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'balanceOf', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], []) / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(function(outputTypeList, pathDownList){ var out = getValueFromExistingSmartContract(address, '0x43995D5A8221841AD6c1F28C1ea8cA802214a318', Coin_FTMCUE.abi, 'balanceOf', [{t:'Address'}], outputTypeList, chainInfo, setChainInfo, [], (address ? address : ''), []); if (out.checked){return out[0];}else{return defaultValue(outputTypeList[0], pathDownList)}}([{t:'UInteger'}], [])) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-1    '/>
								<div  className='  col-10    ml-0  mr-0' style={{padding:'0'}}><DecimalInputRecall defaultValue={0} className='form-control   text-left ' style={{backgroundColor:'', placeholder:'', disabled:false}} onChange={changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c5_ed473511_i_c4_4fc50d58_i_c4_62c85b33}  gVs={[]} setInputValues={setInputValues} inputValues={inputValues} idNos={'fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c4_4fc50d58 i c4_62c85b33'}/>{function(){ var p = []; var valueOut = inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c4_4fc50d58 i c4_62c85b33']; if (!isDecimalText(valueOut) && valueOut){ p.push('Not a Decimal');};  if (p.length > 0){ return <center><p style={{color:'red'}}>{p.join(', ')}</p></center>}else{ return null; }}()}</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{borderWidth:0, padding:5}}><b key={0}>TO</b>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>BNB
								</div>
								<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'16px'}}><span style={{fontFamily:'Alegreya Sans'}}><b>Balance: </b></span></span>
									<span key={1} style={{fontWeight:'bold'}}>{(function (a, b, c){ var d = a.toFixed(b > 100 ? 100 : b); return c ? (+d).toLocaleString("en-US") : d;}(Number((BigInt('18') > BigInt('2') ? Number(getNativeBalance(nativeBalance, setNativeBalance, (address ? address : '')).k / (BigInt('10') ** (BigInt('18') - BigInt('2')))) /(10 ** Number(BigInt('2'))) : Number(getNativeBalance(nativeBalance, setNativeBalance, (address ? address : '')).k) / (10 ** Number(BigInt('18'))))), Number(BigInt('2')), false))}</span>
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-1    '/>
								<div  className='  col-10    ' style={{padding:'0'}}><DecimalInputRecall defaultValue={0} className='form-control   text-left ' style={{backgroundColor:'', placeholder:''}} onChange={changeActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c5_ed473511_i_c0_b7ab97f8_i_c0_15d1fd10}  gVs={[]} setInputValues={setInputValues} inputValues={inputValues} idNos={'fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c0_b7ab97f8 i c0_15d1fd10'}/>{function(){ var p = []; var valueOut = inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c0_b7ab97f8 i c0_15d1fd10']; if (!isDecimalText(valueOut) && valueOut){ p.push('Not a Decimal');};  if (p.length > 0){ return <center><p style={{color:'red'}}>{p.join(', ')}</p></center>}else{ return null; }}()}</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row  no-gutters  justify-content-start  align-items-start'>
								<div className='  col-12     text-left' style={{borderWidth:0, padding:10}}>Slippage Tolerance (%)
								</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-1    '/>
								<div  className='  col-10    ' style={{padding:'0'}}><IntegerInputRecall defaultValue={0} className='form-control   text-left ' style={{backgroundColor:'', placeholder:''}} gVs={[]} setInputValues={setInputValues} inputValues={inputValues} idNos={'fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c5_3edeb688 i c5_21d800c3'}/>{function(){ var p = []; var valueOut = inputValues['fe c3_6374a0a2 _s 1 k c0_f975b388 i c1_a28ca823 i c5_ed473511 i c5_3edeb688 i c5_21d800c3']; if (!isIntegerText(valueOut) && valueOut){ p.push('Not an Integer');};  if (p.length > 0){ return <center><p style={{color:'red'}}>{p.join(', ')}</p></center>}else{ return null; }}()}</div>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-4    '/>
								<button style={{cursor:'pointer'}} className='btn btn-light    col-3    '  onClick={clickActionfe_c3_6374a0a2__s_1_k_c0_f975b388_i_c1_a28ca823_i_c5_ed473511_i_c3_c75c0277_i_c3_044a4a91} >{'Trade'}</button>
								<div className='  col-4    '/>
							</div></div>
							<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
								<div className='  col-12  mt-1  mb-1  '/>
							</div></div>
						</div></div>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-12  mt-1  mb-1  '/>
					</div></div>
					<div className=' '><div style={{backgroundColor:''}} className='row   justify-content-start  align-items-start'>
						<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}><span key={0} style={{fontSize:'12px'}}><i>Wolf Financial 2022</i></span>
						</div>
						<div className='  col-6     text-left' style={{borderWidth:0, padding:10}}>
							<span key={0} style={{fontSize:'12px', cursor:'pointer', cursor:'pointer'}} onClick={clickActionc3_15dfb41f} >{'Twitter.'}</span>
							<span key={1} style={{fontSize:'12px', cursor:'pointer', cursor:'pointer'}} onClick={clickActionc3_7526c28e} >{'Discord.'}</span>
						</div>
					</div></div>
				</div></div>
			</div></div>
	}
}

const App1 = () : Node => {

	var xx = {id:4002, name:'Fantom Testnet', network:'fantom-testnet', nativeCurrency:{decimals:18, name:'FTM', symbol: 'FTM'}, rpcUrls:{default:{http:['https://rpc.testnet.fantom.network']}, public: {http:['https://rpc.testnet.fantom.network']}}, blockExplorers:{etherscan:{name:'FTMScan',url:'https://testnet.ftmscan.com'}, default:{name:'FTMScan', url:'https://testnet.ftmscan.com'}}, contracts:{ multicall3:{address:'0xca11bde05977b3631167028862be2a173976ca11', blockCreated:8328688}}}

	const { chains, publicClient, webSocketPublicClient } = configureChains(
		[xx],
		[publicProvider()]
	);

	const { connectors } = getDefaultWallets({
		appName: 'dapps',
		projectId: 'aa109652644d46bd1a330bf990dc7dca',
		chains
	});

	const wagmiConfig = createConfig({
		autoConnect: true,
		connectors,
		publicClient,
		webSocketPublicClient,
	});

	return <WagmiConfig config={wagmiConfig}><RainbowKitProvider chains={chains}><App /></RainbowKitProvider></WagmiConfig>

	}

	

export default App1;
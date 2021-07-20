import React from 'react';
import { withStyles } from '@material-ui/core/styles';
import { CreateCSSProperties } from '@material-ui/core/styles/withStyles';
import TextField from '@material-ui/core/TextField';
import Input from '@material-ui/core/Input';
import FormHelperText from '@material-ui/core/FormHelperText';
import FormControl from '@material-ui/core/FormControl';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';
import FormControlLabel from '@material-ui/core/FormControlLabel';
import Checkbox from '@material-ui/core/Checkbox';
import I18n from '@iobroker/adapter-react/i18n';
import OAuth2Login from 'react-simple-oauth2-login';
import Message from '@iobroker/adapter-react/Dialogs/Message';

const styles = (): Record<string, CreateCSSProperties> => ({
    input: {
        marginTop: 10,
        marginLeft: 20,
        minWidth: 400,
    },
    button: {
        marginRight: 20,
        marginLeft: 20,
        marginTop: 10,
    },
    card: {
        maxWidth: 345,
        textAlign: 'center',
    },
    media: {
        height: 180,
    },
    column: {
        display: 'inline-block',
        verticalAlign: 'top',
        marginRight: 20,
    },
    columnLogo: {
        width: 350,
        marginRight: 0,
    },
    columnSettings: {
        width: 'calc(100% - 370px)',
    },
    controlElement: {
        //background: "#d2d2d2",
        marginBottom: 5,
    },
});

interface SettingsProps {
    classes: Record<string, string>;
    native: Record<string, any>;

    onChange: (attr: string, value: any) => void;
}

interface SettingsState {
    // add your state properties here
    showMessage: false | string;
}

class Settings extends React.Component<SettingsProps, SettingsState> {
    constructor(props: SettingsProps) {
        super(props);
        this.state = {
            showMessage: false
        };
    }

    renderInput(title: AdminWord, attr: string, type: string) {
        return (
            <TextField
                label={I18n.t(title)}
                className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
                value={this.props.native[attr]}
                type={type || 'text'}
                onChange={(e) => this.props.onChange(attr, e.target.value)}
                margin="normal"
            />
        );
    }

    renderSelect(
        title: AdminWord,
        attr: string,
        options: { value: string; title: AdminWord }[],
        style?: React.CSSProperties,
    ) {
        return (
            <FormControl
                className={`${this.props.classes.input} ${this.props.classes.controlElement}`}
                style={{
                    paddingTop: 5,
                    ...style
                }}
            >
                <Select
                    value={this.props.native[attr] || '_'}
                    onChange={(e) => this.props.onChange(attr, e.target.value === '_' ? '' : e.target.value)}
                    input={<Input name={attr} id={attr + '-helper'} />}
                >
                    {options.map((item) => (
                        <MenuItem key={'key-' + item.value} value={item.value || '_'}>
                            {I18n.t(item.title)}
                        </MenuItem>
                    ))}
                </Select>
                <FormHelperText>{I18n.t(title)}</FormHelperText>
            </FormControl>
        );
    }

    async onOauthSuccess(response: {code: string, state: string}) {
        console.log(response);
        const state = localStorage.getItem('ioBroker.ico-cloud.state');
        if (response.code && response.state === state) {
            localStorage.removeItem('ioBroker..ico-cloud.state');

            const result = await fetch('https://interop.ondilo.com/oauth2/token', {
                method: 'POST',
                mode: 'cors',
                cache: 'no-cache',
                body: `code=${response.code}&grant_type=authorization_code&client_id=customer_api&redirect_uri=${encodeURIComponent(window.location.origin + '/')}`,
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                },
                referrerPolicy: 'no-referrer',
                redirect: 'follow'
            });
            const data = await result.json();
            this.props.onChange('refreshToken', data.refresh_token);
            this.props.onChange('accessToken', data.access_token);
            this.setState({showMessage: I18n.t('loginSuccessMessage')});
        } else {
            this.setState({showMessage: I18n.t('loginWrongStateMessage')});
            console.warn('Supplied state did not match stored state.');
        }
    }

    onOauthFailure(response: unknown) {
        console.log(response);
        console.log('Should show message...??? :-(');
        this.setState({showMessage: I18n.t('loginErrorMessage') + response});
        localStorage.removeItem('ioBroker..ico-cloud.state');
    }

    renderCheckbox(title: AdminWord, attr: string, style?: React.CSSProperties) {
        return (
            <FormControlLabel
                key={attr}
                style={{
                    paddingTop: 5,
                    ...style
                }}
                className={this.props.classes.controlElement}
                control={
                    <Checkbox
                        checked={this.props.native[attr]}
                        onChange={() => this.props.onChange(attr, !this.props.native[attr])}
                        color="primary"
                    />
                }
                label={I18n.t(title)}
            />
        );
    }

    renderMessage() {
        if (this.state.showMessage) {
            return <Message
                text={this.state.showMessage}
                onClose={() => this.setState({showMessage: false})}
            />;
        } else {
            return null;
        }
    }

    renderExplanation() {
        if (!this.props.native.refreshToken) {
            return <>{I18n.t('loginPleaseMessage')}</>
        }
    }

    render() {
        const state = 'ioBroker..ico-cloud' + Date.now() * Math.random();
        localStorage.setItem('ioBroker..ico-cloud.state', state);

        return (
            <form className={this.props.classes.tab}>
                {this.renderMessage()}
                {this.renderInput('labelPollinterval', 'pollinterval', 'number')}

                <OAuth2Login
                    authorizationUrl="https://interop.ondilo.com/oauth2/authorize"
                    responseType="code"
                    clientId="customer_api"
                    scope="api"
                    redirectUri={window.location.origin + '/'}
                    isCrossOrigin={false}
                    onSuccess={this.onOauthSuccess.bind(this)}
                    onFailure={this.onOauthFailure.bind(this)}
                    state={state}
                    buttonText={I18n.t('login')}
                    className={`MuiButtonBase-root MuiFab-root MuiFab-extended ${this.props.classes.button} ${this.props.classes.controlElement}`}
                />

                {this.renderExplanation()}
            </form>
        );
    }
}

export default withStyles(styles)(Settings);

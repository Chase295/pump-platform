/**
 * AlertSettingsForm Component
 * Form for N8N alert configuration with React Hook Form + Zod.
 * Migrated from pump-server/frontend/src/components/forms/AlertSettingsForm.tsx
 */
import React from 'react';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  Typography,
  Box,
  TextField,
  Switch,
  FormControlLabel,
  RadioGroup,
  Radio,
  FormControl,
  FormLabel,
  Alert,
  Chip,
  Checkbox,
} from '@mui/material';
import {
  Notifications as NotificationsIcon,
  Webhook as WebhookIcon,
  FilterList as FilterIcon,
} from '@mui/icons-material';
import type { ServerModel } from '../../types/server';

const alertSettingsSchema = z.object({
  n8n_webhook_url: z.union([z.string().url('Invalid URL format'), z.literal('')]).optional(),
  n8n_enabled: z.boolean(),
  n8n_send_mode: z
    .array(z.enum(['all', 'alerts_only', 'positive_only', 'negative_only']))
    .min(1, 'At least one send mode must be selected'),
  alert_threshold: z.number().min(0).max(1),
  coin_filter_mode: z.enum(['all', 'whitelist']),
  coin_whitelist: z.array(z.string().min(1)).optional(),
  send_ignored_to_n8n: z.boolean(),
});

type AlertSettingsFormData = z.infer<typeof alertSettingsSchema>;

interface AlertSettingsFormProps {
  model: ServerModel;
  onChange?: (data: AlertSettingsFormData) => void;
  disabled?: boolean;
}

const AlertSettingsForm: React.FC<AlertSettingsFormProps> = ({ model, onChange, disabled = false }) => {
  const { control, watch, formState: { errors, isDirty, isValid } } = useForm<AlertSettingsFormData>({
    resolver: zodResolver(alertSettingsSchema),
    defaultValues: {
      n8n_webhook_url: model.n8n_webhook_url || '',
      n8n_enabled: model.n8n_enabled,
      n8n_send_mode: Array.isArray(model.n8n_send_mode)
        ? model.n8n_send_mode
        : model.n8n_send_mode
          ? [model.n8n_send_mode]
          : ['all'],
      alert_threshold: model.alert_threshold,
      coin_filter_mode: model.coin_filter_mode || 'all',
      coin_whitelist: model.coin_whitelist || [],
      send_ignored_to_n8n: model.send_ignored_to_n8n || false,
    },
    mode: 'onChange',
  });

  const coinFilterMode = watch('coin_filter_mode');
  const n8nEnabled = watch('n8n_enabled');

  React.useEffect(() => {
    if (onChange && isDirty) {
      const subscription = watch((data) => {
        onChange(data as AlertSettingsFormData);
      });
      return () => subscription.unsubscribe();
    }
  }, [watch, onChange, isDirty]);

  const sendModeOptions = [
    { value: 'all', label: 'Send all predictions' },
    { value: 'alerts_only', label: 'Only alerts (above threshold)' },
    { value: 'positive_only', label: 'Only positive predictions' },
    { value: 'negative_only', label: 'Only negative predictions' },
  ];

  return (
    <Card variant="outlined">
      <CardContent>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3 }}>
          <NotificationsIcon sx={{ mr: 1, color: 'primary.main' }} />
          <Typography variant="h6" sx={{ fontWeight: 600 }}>
            N8N Webhook & Alert Settings
          </Typography>
          {isDirty && (
            <Chip label="Unsaved changes" size="small" color="warning" sx={{ ml: 'auto' }} />
          )}
        </Box>

        {/* N8N Webhook URL */}
        <Controller
          name="n8n_webhook_url"
          control={control}
          render={({ field, fieldState: { error } }) => (
            <TextField
              {...field}
              label="N8N Webhook URL"
              fullWidth
              margin="normal"
              placeholder="https://your-n8n-instance/webhook/..."
              helperText={error ? error.message : 'Leave empty to use global URL'}
              error={!!error}
              disabled={disabled}
              InputProps={{
                startAdornment: <WebhookIcon sx={{ mr: 1, color: 'action.active' }} />,
              }}
            />
          )}
        />

        {/* N8N Enabled */}
        <Controller
          name="n8n_enabled"
          control={control}
          render={({ field }) => (
            <FormControlLabel
              control={<Switch {...field} checked={field.value} disabled={disabled} />}
              label="Enable N8N notifications"
              sx={{ mt: 2, mb: 2 }}
            />
          )}
        />

        {/* Send Mode */}
        {n8nEnabled && (
          <Controller
            name="n8n_send_mode"
            control={control}
            render={({ field, fieldState: { error } }) => (
              <Box sx={{ mt: 2, mb: 2 }}>
                <Typography variant="subtitle2" gutterBottom sx={{ mb: 1 }}>
                  Send Mode (multiple selectable):
                </Typography>
                <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
                  {sendModeOptions.map((option) => {
                    const optionValue = option.value as 'all' | 'alerts_only' | 'positive_only' | 'negative_only';
                    return (
                      <FormControlLabel
                        key={option.value}
                        control={
                          <Checkbox
                            checked={field.value?.includes(optionValue) || false}
                            onChange={(e) => {
                              const current = field.value || [];
                              if (e.target.checked) {
                                if (!current.includes(optionValue)) {
                                  field.onChange([...current, optionValue]);
                                }
                              } else {
                                field.onChange(current.filter((v) => v !== optionValue));
                              }
                            }}
                            disabled={disabled}
                          />
                        }
                        label={option.label}
                      />
                    );
                  })}
                </Box>
                {error && (
                  <Typography variant="caption" color="error" sx={{ mt: 0.5, display: 'block' }}>
                    {error.message}
                  </Typography>
                )}
              </Box>
            )}
          />
        )}

        {/* Send ignored to n8n */}
        {n8nEnabled && (
          <Controller
            name="send_ignored_to_n8n"
            control={control}
            render={({ field }) => (
              <FormControlLabel
                control={<Switch checked={field.value || false} onChange={field.onChange} disabled={disabled} />}
                label={
                  <Box>
                    <Typography variant="body2">Also send ignored coins to n8n</Typography>
                    <Typography variant="caption" color="text.secondary">
                      Coins ignored due to max-log-entries are still sent to n8n (not saved to DB)
                    </Typography>
                  </Box>
                }
                sx={{ mt: 2 }}
              />
            )}
          />
        )}

        {/* Alert Threshold */}
        <Box sx={{ mt: 3, mb: 2 }}>
          <Typography variant="subtitle2" gutterBottom sx={{ display: 'flex', alignItems: 'center' }}>
            <FilterIcon sx={{ mr: 1, fontSize: 16 }} />
            Alert Threshold (%)
          </Typography>
          <Controller
            name="alert_threshold"
            control={control}
            render={({ field, fieldState: { error } }) => {
              const percentValue = Math.round((field.value || 0) * 100);
              return (
                <TextField
                  type="number"
                  fullWidth
                  label="Alert threshold in percent"
                  value={percentValue}
                  onChange={(e) => {
                    const percent = Number(e.target.value);
                    if (percent >= 0 && percent <= 100) {
                      field.onChange(percent / 100);
                    }
                  }}
                  onBlur={field.onBlur}
                  inputRef={field.ref}
                  error={!!error}
                  helperText={error ? error.message : `Value between 1-99% (current: ${percentValue}%)`}
                  disabled={disabled}
                  inputProps={{ min: 1, max: 99, step: 1 }}
                  sx={{ mt: 1 }}
                />
              );
            }}
          />
        </Box>

        {/* Coin Filter */}
        <FormControl component="fieldset" margin="normal" fullWidth>
          <FormLabel component="legend" sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
            <FilterIcon sx={{ mr: 1, fontSize: 16 }} />
            Coin Filter Mode
          </FormLabel>
          <Controller
            name="coin_filter_mode"
            control={control}
            render={({ field }) => (
              <RadioGroup {...field} row>
                <FormControlLabel value="all" control={<Radio disabled={disabled} />} label="All coins" />
                <FormControlLabel value="whitelist" control={<Radio disabled={disabled} />} label="Whitelist only" />
              </RadioGroup>
            )}
          />
        </FormControl>

        {/* Coin Whitelist */}
        {coinFilterMode === 'whitelist' && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2" gutterBottom>
              Coin Whitelist (one address per line)
            </Typography>
            <Controller
              name="coin_whitelist"
              control={control}
              render={({ field, fieldState: { error } }) => (
                <Box>
                  <TextField
                    {...field}
                    multiline
                    rows={4}
                    fullWidth
                    placeholder="Coin addresses..."
                    disabled={disabled}
                    error={!!error}
                    helperText={error ? error.message : `${field.value?.length || 0} coins in whitelist`}
                    value={field.value ? field.value.join('\n') : ''}
                    onChange={(e) => {
                      const lines = e.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter((line) => line.length > 0);
                      field.onChange(lines);
                    }}
                  />
                </Box>
              )}
            />
          </Box>
        )}

        {/* Validation hints */}
        {!isValid && Object.keys(errors).length > 0 && (
          <Alert severity="error" sx={{ mt: 2 }}>
            Please correct the form errors.
          </Alert>
        )}
        {isDirty && isValid && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Your changes are ready to save.
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};

export default AlertSettingsForm;

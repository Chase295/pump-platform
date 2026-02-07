import React from 'react';
import {
  FormControl,
  FormHelperText,
  Checkbox,
  FormControlLabel,
  Typography,
  Box,
  Button,
  Chip,
} from '@mui/material';

interface FeatureItem {
  id: string;
  label: string;
  description?: string;
}

interface FeatureGroup {
  name: string;
  features: FeatureItem[];
}

interface FeatureSelectorProps {
  label: string;
  categories: FeatureGroup[];
  selectedFeatures: string[];
  onChange: (features: string[]) => void;
  error?: string;
  helperText?: string;
  disabled?: boolean;
}

const FeatureSelector: React.FC<FeatureSelectorProps> = ({
  label,
  categories,
  selectedFeatures,
  onChange,
  error,
  helperText,
  disabled = false,
}) => {
  const handleFeatureToggle = (featureId: string) => {
    if (disabled) return;
    const newSelected = selectedFeatures.includes(featureId)
      ? selectedFeatures.filter((id) => id !== featureId)
      : [...selectedFeatures, featureId];
    onChange(newSelected);
  };

  const handleCategoryToggle = (categoryFeatures: FeatureItem[]) => {
    if (disabled) return;
    const categoryIds = categoryFeatures.map((f) => f.id);
    const allSelected = categoryIds.every((id) => selectedFeatures.includes(id));

    if (allSelected) {
      onChange(selectedFeatures.filter((id) => !categoryIds.includes(id)));
    } else {
      onChange([...selectedFeatures.filter((id) => !categoryIds.includes(id)), ...categoryIds]);
    }
  };

  const handleSelectAll = () => {
    if (disabled) return;
    const allIds = categories.flatMap((cat) => cat.features.map((f) => f.id));
    const allSelected = allIds.every((id) => selectedFeatures.includes(id));
    onChange(allSelected ? [] : allIds);
  };

  const handleClear = () => {
    if (disabled) return;
    onChange([]);
  };

  return (
    <FormControl fullWidth error={!!error} disabled={disabled}>
      <Box sx={{ mb: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
          <Typography variant="subtitle1" sx={{ color: 'text.primary', fontWeight: 600 }}>
            {label}
            <Chip
              label={`${selectedFeatures.length} selected`}
              size="small"
              sx={{ ml: 1, bgcolor: 'rgba(0, 212, 255, 0.2)', color: '#00d4ff' }}
            />
          </Typography>
          <Box sx={{ display: 'flex', gap: 1 }}>
            <Button size="small" variant="outlined" onClick={handleSelectAll} disabled={disabled}>
              All
            </Button>
            <Button size="small" variant="outlined" color="error" onClick={handleClear} disabled={disabled}>
              Clear
            </Button>
          </Box>
        </Box>

        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {categories.map((category) => {
            const categoryIds = category.features.map((f) => f.id);
            const allSelected = categoryIds.every((id) => selectedFeatures.includes(id));
            const someSelected = categoryIds.some((id) => selectedFeatures.includes(id));

            return (
              <Box
                key={category.name}
                sx={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 1, p: 2 }}
              >
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                  <FormControlLabel
                    control={
                      <Checkbox
                        checked={allSelected}
                        indeterminate={someSelected && !allSelected}
                        onChange={() => handleCategoryToggle(category.features)}
                        disabled={disabled}
                        sx={{
                          color: 'grey.400',
                          '&.Mui-checked': { color: '#00d4ff' },
                          '&.MuiCheckbox-indeterminate': { color: '#00d4ff' },
                        }}
                      />
                    }
                    label={
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: 'text.primary' }}>
                        {category.name}
                        <Chip
                          label={`${categoryIds.filter((id) => selectedFeatures.includes(id)).length}/${categoryIds.length}`}
                          size="small"
                          sx={{ ml: 1, height: 20, fontSize: '0.7rem' }}
                          color={allSelected ? 'success' : someSelected ? 'warning' : 'default'}
                        />
                      </Typography>
                    }
                    sx={{ margin: 0 }}
                  />
                </Box>

                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
                    gap: 1,
                    ml: 4,
                  }}
                >
                  {category.features.map((feature) => (
                    <FormControlLabel
                      key={feature.id}
                      control={
                        <Checkbox
                          checked={selectedFeatures.includes(feature.id)}
                          onChange={() => handleFeatureToggle(feature.id)}
                          disabled={disabled}
                          sx={{
                            color: 'grey.400',
                            '&.Mui-checked': { color: '#00d4ff' },
                          }}
                        />
                      }
                      label={
                        <Box>
                          <Typography variant="body2" sx={{ color: 'text.primary' }}>
                            {feature.label}
                          </Typography>
                          {feature.description && (
                            <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block' }}>
                              {feature.description}
                            </Typography>
                          )}
                        </Box>
                      }
                      sx={{ alignItems: 'flex-start', margin: 0 }}
                    />
                  ))}
                </Box>
              </Box>
            );
          })}
        </Box>

        {selectedFeatures.length > 0 && (
          <Box sx={{ mt: 2, p: 2, bgcolor: 'rgba(0, 212, 255, 0.1)', borderRadius: 1 }}>
            <Typography variant="body2" sx={{ color: 'text.primary', fontWeight: 500, mb: 1 }}>
              Selected Features ({selectedFeatures.length}):
            </Typography>
            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
              {selectedFeatures.slice(0, 20).map((featureId) => (
                <Chip
                  key={featureId}
                  label={featureId}
                  size="small"
                  onDelete={() => handleFeatureToggle(featureId)}
                  sx={{
                    bgcolor: 'rgba(0, 212, 255, 0.2)',
                    color: '#00d4ff',
                    border: '1px solid rgba(0, 212, 255, 0.3)',
                    '& .MuiChip-deleteIcon': { color: '#00d4ff' },
                  }}
                />
              ))}
              {selectedFeatures.length > 20 && (
                <Chip
                  label={`+${selectedFeatures.length - 20} more`}
                  size="small"
                  sx={{ bgcolor: 'rgba(255, 152, 0, 0.2)' }}
                />
              )}
            </Box>
          </Box>
        )}

        {(error || helperText) && <FormHelperText error={!!error}>{error || helperText}</FormHelperText>}
      </Box>
    </FormControl>
  );
};

export default FeatureSelector;

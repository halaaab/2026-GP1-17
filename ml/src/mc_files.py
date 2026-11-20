"""The Ministry of Commerce (MC) files: which files exist and what their columns mean.

Used by 00_download, 01_eda_raw and 02_preprocess_businesses, so all three read the files the same way.
Nothing here changes a value: it only says which column is which.
"""
import re

import numpy as np
import pandas as pd

# Every quarter, 2023 Q1 – 2026 Q3: (quarter, file name). Two parts per quarter.
MC_FILES = [
    ('2023Q1', 'CR_2023-01q-active-crs_PART1.xlsx'),
    ('2023Q1', 'CR_2023-01q-active-crs_PART2.xlsx'),
    ('2023Q2', 'CR_2023-02q-active-crs_PART1.xlsx'),
    ('2023Q2', 'CR_2023-02q-active-crs_PART2.xlsx'),
    ('2023Q3', 'CR_2023-03q-active-crs_PART1.xlsx'),
    ('2023Q3', 'CR_2023-03q-active-crs_PART2.xlsx'),
    ('2023Q4', 'CR_2023-04q-active-crs_PART1.xlsx'),
    ('2023Q4', 'CR_2023-04q-active-crs_PART2.xlsx'),
    ('2024Q1', 'CR_2024-01q-active-crs_PART1.xlsx'),
    ('2024Q1', 'CR_2024-01q-active-crs_PART2.xlsx'),
    ('2024Q2', 'CR_2024-02q-active-crs_PART1.xlsx'),
    ('2024Q2', 'CR_2024-02q-active-crs_PART2.xlsx'),
    ('2024Q3', 'CR_2024-03q-active-crs_PART1-2.xlsx'),
    ('2024Q3', 'CR_2024-03q-active-crs_PART2-2.xlsx'),
    ('2024Q4', 'CR_2024-04q-active-crs_PART1.xlsx'),
    ('2024Q4', 'CR_2024-04q-active-crs_PART2.xlsx'),
    ('2025Q1', 'CR_2025-01q-active-crs_PART1.xlsx'),
    ('2025Q1', 'CR_2025-01q-active-crs_PART2.xlsx'),
    ('2025Q2', '2025-02q-active-crs_PART1-2.xlsx'),
    ('2025Q2', '2025-02q-active-crs_PART2.xlsx'),
    ('2025Q3', '2025-03q-active-crs_PART1.xlsx'),
    ('2025Q3', '2025-03q-active-crs_PART2-2.xlsx'),
    ('2025Q4', '2025-04q-active-crs_PART1.xlsx'),
    ('2025Q4', '2025-04q-active-crs_PART2.xlsx'),
    ('2026Q1', '2026 01q active_PART1.xlsx'),
    ('2026Q1', '2026 01q active_PART2.xlsx'),
    ('2026Q2', '2026 02q active crs_PART1.xlsx'),
    ('2026Q2', '2026 02q active crs_PART2.xlsx'),
    ('2026Q3', 'CR A 2026-09-30_PART1.xlsx'),
    ('2026Q3', 'CR A 2026-09-30_PART2-2.xlsx'),
]
QUARTERS = sorted({q for q, _ in MC_FILES})

# One common name for every column, whatever its name in a given year
COMMON_NAMES = {
    'الرقم الوطني': 'registration_number',                          # up to 2025 Q3
    'الرقم الموحد': 'registration_number',                          # from 2025 Q4 (the same number, new column name: 01a_id_check)
    'الرقم الرئيسي للسجل التجاري': 'main_registration_number',       # for a branch: the ID of its main record (up to 2025 Q3)
    'رقم السجل': 'commercial_register_number',                      # from 2025 Q4
    'نوع السجل التجاري': 'registration_type',
    'نوع السجل': 'registration_type',
    'اسم السجل التجاري': 'business_name',
    'اسم السجل': 'business_name',
    'نوع الكيان': 'entity_type',
    'الكيان القانوني': 'entity_type',
    'نوع النشاط التجاري (بالعربية)': 'legal_form',  # despite its Arabic name, this is the detailed legal form
    'الكيان القانوني.1': 'legal_form',
    'رأس المال': 'registered_capital_sar',
    'اسم المدينة (بالعربية)': 'city',
    'المدينة': 'city',
    'اسم المنطقة (بالعربية)': 'region',
    'المنطقة': 'region',
    'مفصح بالتجارة الإلكترونية؟': 'ecommerce_disclosed',
    'مفصح بتجارة إلكترونية؟': 'ecommerce_disclosed',
    'مفصح تجارة إلكترونية؟': 'ecommerce_disclosed',
    'لديه تجارة إلكترونية؟': 'ecommerce_disclosed',
    'تاريخ الإصدار (ميلادي)': 'founding_date',
    'تاريخ انشاء السجل': 'founding_date',
}
# Exceptions for one quarter: in 2025 Q4 "الكيان القانوني" holds the detailed legal form, not the entity type
QUARTER_NAMES = {'2025Q4': {'الكيان القانوني': 'legal_form'}}
# Exceptions for one file: 2023 Q3 PART1 has its region values under the e-commerce title,
# and its e-commerce values under "لديه تجارة إلكترونية؟"
FILE_NAMES = {'CR_2023-03q-active-crs_PART1.xlsx': {'مفصح بالتجارة الإلكترونية؟': 'region',
                                                    'لديه تجارة إلكترونية؟': 'ecommerce_disclosed'}}

COLUMNS = ['snapshot_quarter', 'source_file', 'registration_number', 'main_registration_number',
           'commercial_register_number', 'registration_type', 'business_name', 'entity_type', 'legal_form',
           'registered_capital_sar', 'region', 'city', 'ecommerce_disclosed', 'founding_date']
FEW_VALUES = ['snapshot_quarter', 'source_file', 'registration_type', 'entity_type', 'legal_form', 'region', 'city',
              'ecommerce_disclosed']
MAIN, BRANCH = 'رئيسي', 'فرعي'


def column_names(quarter, file_name):
    """Original column title -> common name, for one file."""
    return {**COMMON_NAMES, **QUARTER_NAMES.get(quarter, {}), **FILE_NAMES.get(file_name, {})}


def header_copy_rows(table):
    """True for rows whose values are the column titles (the header copied as a data row)."""
    titles = pd.Series([re.sub(r'\.\d+$', '', str(c)).strip() for c in table.columns], index=table.columns)
    return table.eq(titles).sum(axis=1) >= len(titles) // 2


def standard_columns(table, quarter, file_name):
    """The same table with the common column names, plus snapshot_quarter and source_file. Values are not changed.
    A column the file does not have is empty."""
    table = table.rename(columns=column_names(quarter, file_name))
    table = table.loc[:, ~table.columns.duplicated()]
    return table.assign(snapshot_quarter=quarter, source_file=file_name).reindex(columns=COLUMNS)


def entity_type_from(legal_form):
    """Entity type from the detailed legal form: 'مؤسسة…' -> مؤسسة, 'شركة…' -> شركة, 'فرع …' kept as it is."""
    form = legal_form.astype('string').fillna('')
    kind = np.select([form.str.startswith('فرع'), form.str.startswith('مؤسس'), form.str.startswith('شركة')],
                     [form, 'مؤسسة', 'شركة'], default='')
    return pd.Series(kind, index=legal_form.index, dtype='string').replace('', pd.NA)
